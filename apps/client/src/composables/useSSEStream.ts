export interface ReferenceChunk {
  content: string;
  dataset_id: string;
  doc_type: string;
  document_id: string;
  document_name: string;
  id: string;
  image_id: string;
  positions: number[][];
  similarity: number;
  term_similarity: number;
  url: null | string;
  vector_similarity: number;
}

export interface ReferenceDocAgg {
  count: number;
  doc_id: string;
  doc_name: string;
}

export interface Reference {
  chunks: ReferenceChunk[];
  doc_aggs: ReferenceDocAgg[];
}

/**
 * Lightweight SSE stream parser for RAGFlow responses.
 * Replaces vue-element-plus-x's useXStream with ~40 lines of native code.
 *
 * RAGFlow SSE format:
 *   data: {"data":{"answer":"text chunk", "reference": {...}}}
 *   data: {"data":true}   ← stream end signal
 */
export function useSSEStream() {
  const content = ref('');
  const isStreaming = ref(false);
  const error = ref<null | string>(null);
  const reference = ref<null | Reference>(null);

  let abortController: AbortController | null = null;

  function reset() {
    content.value = '';
    error.value = null;
    reference.value = null;
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

    /** Returns true when the stream-end sentinel `data:true` is seen. */
    const processLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return false;
      const raw = trimmed.slice(5).trim();
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as {
          data: true | { answer: string; reference?: Record<string, unknown> };
        };
        if (parsed.data === true) {
          isStreaming.value = false;
          return true;
        }
        if (typeof parsed.data === 'object') {
          if ('answer' in parsed.data) {
            const answer = parsed.data.answer;
            // RAGFlow may send accumulated text or delta text.
            if (answer.startsWith(content.value)) content.value = answer;
            else content.value += answer;
          }
          const ref = parsed.data.reference;
          if (
            ref &&
            typeof ref === 'object' &&
            'chunks' in ref &&
            Array.isArray(ref.chunks) &&
            ref.chunks.length > 0
          ) {
            reference.value = ref as unknown as Reference;
          }
        }
      } catch (parseError) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[useSSEStream] failed to parse SSE line', parseError);
        }
      }
      return false;
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || abortController.signal.aborted) {
          // Flush whatever is still in the buffer plus any UTF-8 bytes
          // held by the streaming decoder. Without this, an SSE message
          // that ends without a trailing newline before close is dropped.
          buffer += decoder.decode();
          if (buffer.trim()) {
            for (const line of buffer.split('\n')) processLine(line);
            buffer = '';
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (processLine(line)) return;
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
    reference: readonly(reference),
    startStream,
    cancel,
  };
}
