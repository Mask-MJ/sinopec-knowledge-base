import type { Reference } from './useSSEStream';

import { toRaw } from 'vue';

import { completions, uploadChatAttachments } from '@/api/assistant';

import { useSSEStream } from './useSSEStream';

export type {
  Reference,
  ReferenceChunk,
  ReferenceDocAgg,
} from './useSSEStream';

/** 历史消息上 RAGFlow 记录的附件元数据，前端只展示文件名 */
export interface ChatMessageFile {
  name: string;
}

export interface ChatMessage {
  content: string;
  /** 该条用户消息附带的附件 */
  files?: ChatMessageFile[];
  key: number;
  loading: boolean;
  reasoning: string;
  reference?: Reference;
  role: 'assistant' | 'user';
  thinkingStatus: 'end' | 'start' | 'thinking';
}

/**
 * Parse `<think>...</think>` tags from text.
 * Handles both completed and unclosed (streaming) think blocks.
 * Returns [reasoning, content, isThinking] tuple.
 */
export function parseThinkContent(text: string): [string, string, boolean] {
  // Match completed <think>...</think> blocks
  const completedReasoning = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)]
    .map((m) => m[1])
    .join('')
    .trim();

  // After removing completed blocks, check for an unclosed <think> tag (streaming)
  const withoutCompleted = text.replaceAll(/<think>[\s\S]*?<\/think>/g, '');
  const unclosedMatch = withoutCompleted.match(/<think>([\s\S]*)$/);
  const isThinking = !!unclosedMatch;
  const unclosedReasoning = unclosedMatch?.[1]?.trim() ?? '';

  const reasoning = [completedReasoning, unclosedReasoning]
    .filter(Boolean)
    .join('');
  const content = withoutCompleted.replace(/<think>[\s\S]*$/, '').trim();

  return [reasoning, content, isThinking];
}

export function useChat(
  assistantId: Ref<number>,
  sessionId: Ref<string | undefined>,
) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  let activeAssistantIndex = -1;

  const sseStream = useSSEStream();

  function initMessages(
    history: ReadonlyArray<{
      content?: string;
      files?: ReadonlyArray<ChatMessageFile>;
      reference?: Reference;
      role: string;
    }>,
  ) {
    messages.value = history.map((item, i) => {
      const [reasoning, content] = parseThinkContent(item.content ?? '');
      return {
        key: i,
        role: item.role as 'assistant' | 'user',
        content,
        reasoning,
        loading: false,
        thinkingStatus: 'end' as const,
        reference: item.reference,
        files: item.files?.map(({ name }) => ({ name })),
      };
    });
    activeAssistantIndex = -1;
  }

  function updateAssistantMessage(patch: Partial<ChatMessage>) {
    if (activeAssistantIndex < 0) return;
    const msg = messages.value[activeAssistantIndex];
    if (!msg) return;
    Object.assign(msg, patch);
  }

  /**
   * 发送一条提问。带附件时先上传、拿到附件 ID 再提问；附件只对这一次提问生效。
   * 返回 false 表示没发出去（上传失败），调用方应保留输入框里的问题和附件。
   */
  async function send(question: string, files: File[] = []) {
    if (!sessionId.value || sending.value || !question.trim()) return false;
    sending.value = true;
    const currentSessionId = sessionId.value;

    let attachmentIds: string[] = [];
    if (files.length > 0) {
      try {
        const uploaded = await uploadChatAttachments(
          assistantId.value,
          currentSessionId,
          files,
        );
        attachmentIds = uploaded.map((item) => item.id);
      } catch (error) {
        window.$message.error(
          error instanceof Error ? error.message : '附件上传失败',
        );
        sending.value = false;
        return false;
      }
    }

    const userMsg: ChatMessage = {
      key: messages.value.length,
      role: 'user',
      content: question,
      reasoning: '',
      loading: false,
      thinkingStatus: 'end',
      files: files.length > 0 ? files.map(({ name }) => ({ name })) : undefined,
    };
    const assistantMsg: ChatMessage = {
      key: messages.value.length + 1,
      role: 'assistant',
      content: '',
      reasoning: '',
      loading: true,
      thinkingStatus: 'start',
    };
    messages.value = [...messages.value, userMsg, assistantMsg];
    activeAssistantIndex = messages.value.length - 1;

    try {
      const { response } = await completions(assistantId.value, {
        stream: true,
        sessionId: currentSessionId,
        question,
        // 没附件时不带这个键，请求体与原来一致
        ...(attachmentIds.length > 0 && { attachmentIds }),
      });
      if (!response.body) throw new Error('响应体为空');
      await sseStream.startStream(response.body);
    } catch {
      updateAssistantMessage({
        content: '请求失败，请重试',
        loading: false,
        thinkingStatus: 'end',
      });
      window.$message.error('发送消息失败，请重试');
    } finally {
      sending.value = false;
    }
    return true;
  }

  // Watch SSE stream content changes
  //
  // RAGFlow 0.26 起，推理模型的思考由 start_to_think / end_to_think 标记事件划分，
  // useSSEStream 已按标记把它分流到 reasoning。仍保留 parseThinkContent，用于
  // 兼容以 `<think>` 文本形式返回思考的情况（旧版本 / legacy 流式模式）。
  watch([sseStream.content, sseStream.reasoning], ([text, streamReasoning]) => {
    if (activeAssistantIndex < 0) return;
    if (!text && !streamReasoning) return;
    const [inlineReasoning, content, isInlineThinking] =
      parseThinkContent(text);
    const reasoning = streamReasoning || inlineReasoning;
    // 思考已开始但正文还没出来 = 仍在思考
    const isThinking = isInlineThinking || (!!reasoning && !content);
    let thinkingStatus: 'end' | 'start' | 'thinking' = 'start';
    if (isThinking) thinkingStatus = 'thinking';
    else if (reasoning) thinkingStatus = 'end';
    updateAssistantMessage({
      content,
      reasoning,
      loading: true,
      thinkingStatus,
    });
  });

  // Watch stream end — attach reference data from the final SSE chunk
  watch(sseStream.isStreaming, (streaming) => {
    if (!streaming && activeAssistantIndex >= 0) {
      const current = messages.value[activeAssistantIndex];
      if (current) {
        const ref = sseStream.reference.value;
        // toRaw 必须：sseStream.reference 是 readonly() 包装的 Vue Proxy，
        // structuredClone 在 Proxy 上抛 DataCloneError 然后整个 watcher 静默失败，
        // 导致流式答完点 [N] 显示"未携带引用数据"。先 toRaw 解包再 clone。
        updateAssistantMessage({
          loading: false,
          thinkingStatus: 'end',
          reference: ref
            ? (structuredClone(toRaw(ref)) as Reference)
            : undefined,
        });
      }
      activeAssistantIndex = -1;
    }
  });

  return {
    messages,
    sending: readonly(sending),
    send,
    initMessages,
  };
}
