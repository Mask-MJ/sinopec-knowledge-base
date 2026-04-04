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
 * Returns [reasoning, content] tuple.
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
    const [reasoning, content] = parseThinkContent(text);
    updateAssistantMessage({
      content,
      reasoning,
      loading: true,
      thinkingStatus: reasoning ? 'thinking' : 'start',
    });
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
