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
 *
 * 推理模型（DeepSeek 等）的思考过程由 `start_to_think` / `end_to_think` 两个标记
 * 事件包裹（RAGFlow 0.26 起改用结构化标记，不再是 `<think>` 文本）。两个标记之间
 * 的 answer 属于思考、不是答案，分流到 `reasoning`，否则整段推理独白会混进正文。
 */
export function useSSEStream() {
  const content = ref('');
  const reasoning = ref('');
  const isStreaming = ref(false);
  const error = ref<null | string>(null);
  const reference = ref<null | Reference>(null);

  let abortController: AbortController | null = null;

  function reset() {
    content.value = '';
    reasoning.value = '';
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
    let inThinking = false;

    /** Returns true when the stream-end sentinel `data:true` is seen. */
    const processLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return false;
      const raw = trimmed.slice(5).trim();
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as {
          data:
            | true
            | {
                answer: string;
                end_to_think?: boolean;
                reference?: Record<string, unknown>;
                start_to_think?: boolean;
              };
        };
        if (parsed.data === true) {
          isStreaming.value = false;
          return true;
        }
        if (typeof parsed.data === 'object') {
          // 标记事件自身的 answer 为空串，先切状态再分流即可。
          if (parsed.data.start_to_think) inThinking = true;
          if (parsed.data.end_to_think) inThinking = false;
          if ('answer' in parsed.data) {
            const answer = parsed.data.answer;
            const target = inThinking ? reasoning : content;
            // RAGFlow may send accumulated text or delta text.
            if (answer.startsWith(target.value)) target.value = answer;
            else target.value += answer;
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
    reasoning: readonly(reasoning),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    reference: readonly(reference),
    startStream,
    cancel,
  };
}
