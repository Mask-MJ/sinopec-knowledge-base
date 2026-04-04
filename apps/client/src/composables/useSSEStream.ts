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
  const error = ref<string | null>(null);

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

    const reader = stream
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || abortController.signal.aborted) break;

        buffer += value;
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw) as { data: { answer: string } | true };
            if (parsed.data === true) {
              // Stream end signal
              isStreaming.value = false;
              return;
            }
            if (
              typeof parsed.data === 'object' &&
              parsed.data !== null &&
              'answer' in parsed.data
            ) {
              content.value = parsed.data.answer;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (e) {
      if (!abortController?.signal.aborted) {
        error.value = e instanceof Error ? e.message : '流式请求失败';
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
