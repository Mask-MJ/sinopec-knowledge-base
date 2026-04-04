import type { BubbleProps } from 'vue-element-plus-x/types/Bubble';
import type { ThinkingStatus } from 'vue-element-plus-x/types/Thinking';

import { useXStream } from 'vue-element-plus-x';

import { completions } from '@/api/assistant';

export interface ChatMessage extends BubbleProps {
  collapse?: boolean;
  content?: string;
  key: number;
  reasoning_content?: string;
  role: 'assistant' | 'user';
  thinkingStatus?: ThinkingStatus;
}

interface StreamChunkData {
  answer: string;
}

function isStreamChunkData(data: unknown): data is StreamChunkData {
  return typeof data === 'object' && data !== null && 'answer' in data;
}

function safeJsonParse(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Parse think tags from text. Returns [reasoning, content] tuple.
 */
export function parseThinkContent(text: string): [string, string] {
  const reasoning = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)]
    .map((m) => m[1])
    .join('')
    .trim();
  const content = text.replaceAll(/<think>[\s\S]*?<\/think>/g, '').trim();
  return [reasoning, content];
}

export function useChat(
  assistantId: Ref<number>,
  sessionId: Ref<string | undefined>,
) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  let activeAssistantIndex = -1;

  const { startStream, data } = useXStream();

  function initMessages(
    history: ReadonlyArray<{ content?: string; role: string }>,
  ) {
    messages.value = history.map((item, i) => {
      const [reasoning, content] = parseThinkContent(item.content ?? '');
      return {
        key: i,
        role: item.role as 'assistant' | 'user',
        content,
        reasoning_content: reasoning,
        placement: (item.role === 'assistant' ? 'start' : 'end') as
          | 'end'
          | 'start',
        avatarSize: '32px',
        avatarGap: '12px',
        isMarkdown: item.role === 'assistant',
        loading: false,
        thinkingStatus: 'end' as const,
        collapse: false,
      };
    });
    activeAssistantIndex = -1;
  }

  function updateAssistantMessage(patch: Partial<ChatMessage>) {
    if (activeAssistantIndex < 0) return;
    const idx = activeAssistantIndex;
    messages.value = messages.value.map((msg, i) =>
      i === idx ? { ...msg, ...patch } : msg,
    );
  }

  async function send(question: string) {
    if (!sessionId.value || sending.value || !question.trim()) return;
    sending.value = true;

    const userMsg: ChatMessage = {
      key: messages.value.length,
      role: 'user',
      content: question,
      reasoning_content: '',
      placement: 'end',
      avatarSize: '32px',
      avatarGap: '12px',
      isMarkdown: false,
      loading: false,
      thinkingStatus: 'end',
      collapse: false,
    };
    const assistantMsg: ChatMessage = {
      key: messages.value.length + 1,
      role: 'assistant',
      content: '',
      reasoning_content: '',
      placement: 'start',
      avatarSize: '32px',
      avatarGap: '12px',
      isMarkdown: true,
      loading: true,
      thinkingStatus: 'start',
      collapse: false,
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
      await startStream({ readableStream: response.body });
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

  watch(
    data,
    (chunks) => {
      if (chunks.length === 0 || activeAssistantIndex < 0) return;

      const lastRaw = safeJsonParse(
        chunks[chunks.length - 1]?.data,
      ) as null | Record<string, unknown>;
      if (!lastRaw) return;

      const payload = lastRaw.data;

      // Stream end signal: data === true
      if (payload === true) {
        const prev =
          chunks.length >= 2
            ? (safeJsonParse(chunks[chunks.length - 2]?.data) as null | Record<
                string,
                unknown
              >)
            : null;
        const prevPayload = prev?.data;
        const text = isStreamChunkData(prevPayload) ? prevPayload.answer : '';
        const [reasoning, content] = parseThinkContent(text);
        updateAssistantMessage({
          content,
          reasoning_content: reasoning,
          loading: false,
          thinkingStatus: 'end',
          collapse: false,
        });
        return;
      }

      // Normal chunk
      if (isStreamChunkData(payload)) {
        const [reasoning, content] = parseThinkContent(payload.answer);
        updateAssistantMessage({
          content,
          reasoning_content: reasoning,
          loading: true,
          thinkingStatus: 'thinking',
          collapse: true,
        });
      }
    },
    { deep: true },
  );

  return {
    messages,
    sending: readonly(sending),
    send,
    initMessages,
  };
}
