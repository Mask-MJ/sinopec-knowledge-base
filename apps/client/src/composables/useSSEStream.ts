/**
 * Lightweight SSE stream parser for RAGFlow responses.
 * Replaces vue-element-plus-x's useXStream with ~40 lines of native code.
 *
 * RAGFlow SSE format:
 *   data: {"data":{"answer":"text chunk"}}
 *   data: {"data":true}   ← stream end signal
 */
export function useSSEStream() {
  const content = ref('');
  const isStreaming = ref(false);
  const error = ref<null | string>(null);

  let abortController: AbortController | null = null;

  function reset() {
    content.value = '';
    error.value = null;
  }

  function cancel() {
    abortController?.abort();
    abortController = null;
    isStreaming.value = false;
  }

  async function startStream(stream: ReadableStream<Uint8Array>) {
    reset();
    isStreaming.value = true;
    abortController = new AbortController();

    const decoder = new TextDecoder();
    const reader = stream.getReader();

    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || abortController.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw) as {
              data: true | { answer: string };
            };
            if (parsed.data === true) {
              // Stream end signal
              isStreaming.value = false;
              return;
            }
            if (typeof parsed.data === 'object' && 'answer' in parsed.data) {
              content.value = parsed.data.answer;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (error_) {
      if (!abortController.signal.aborted) {
        error.value = error_ instanceof Error ? error_.message : '流式请求失败';
      }
    } finally {
      isStreaming.value = false;
      abortController = null;
    }
  }

  return {
    content: readonly(content),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    startStream,
    cancel,
  };
}
