import { completions } from '@/api/assistant';

import { useSSEStream } from './useSSEStream';

export interface ChatMessage {
  content: string;
  key: number;
  loading: boolean;
  reasoning: string;
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
    history: ReadonlyArray<{ content?: string; role: string }>,
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

  async function send(question: string) {
    if (!sessionId.value || sending.value || !question.trim()) return;
    sending.value = true;

    const userMsg: ChatMessage = {
      key: messages.value.length,
      role: 'user',
      content: question,
      reasoning: '',
      loading: false,
      thinkingStatus: 'end',
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
        sessionId: sessionId.value,
        question,
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
  }

  // Watch SSE stream content changes
  watch(sseStream.content, (text) => {
    if (activeAssistantIndex < 0 || !text) return;
    const [reasoning, content, isThinking] = parseThinkContent(text);
    let thinkingStatus: 'end' | 'start' | 'thinking' = 'start';
    if (isThinking) thinkingStatus = 'thinking';
    else if (reasoning) thinkingStatus = 'end';
    updateAssistantMessage({ content, reasoning, loading: true, thinkingStatus });
  });

  // Watch stream end
  watch(sseStream.isStreaming, (streaming) => {
    if (!streaming && activeAssistantIndex >= 0) {
      const current = messages.value[activeAssistantIndex];
      if (current) {
        updateAssistantMessage({
          loading: false,
          thinkingStatus: 'end',
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
