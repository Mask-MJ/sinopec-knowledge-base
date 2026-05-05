import { describe, expect, it } from 'vitest';

import { useSSEStream } from './useSSEStream';

/**
 * Build a ReadableStream<Uint8Array> from a list of string chunks. The stream
 * closes immediately after the last chunk — no extra trailing newline is
 * appended, mirroring what the browser sees when RAGFlow ends the SSE response.
 */
function makeStream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
}

describe('useSSEStream', () => {
  it('captures reference chunks from the final SSE message even when the stream closes without a trailing newline', async () => {
    const finalMessage =
      'data:{"code":0,"data":{"answer":"","reference":{"chunks":[{"id":"a","content":"x"},{"id":"b","content":"y"}]}}}';
    const endSignal = 'data:{"code":0,"data":true}';

    const stream = makeStream([
      'data:{"code":0,"data":{"answer":"hello","reference":{"chunks":[]}}}\n\n',
      `${finalMessage}\n\n${endSignal}`,
    ]);

    const sse = useSSEStream();
    await sse.startStream(stream);

    expect(sse.reference.value).not.toBeNull();
    expect(sse.reference.value?.chunks).toHaveLength(2);
  });

  it('captures reference when the final message and end signal arrive in separate read() calls', async () => {
    const finalMessage =
      'data:{"code":0,"data":{"answer":"","reference":{"chunks":[{"id":"x","content":"v"}]}}}';
    const endSignal = 'data:{"code":0,"data":true}';

    // Real browsers typically deliver the final RAGFlow message in one read()
    // and the trailing end signal in the next read() right before close.
    const stream = makeStream([`${finalMessage}\n\n`, `${endSignal}\n\n`]);

    const sse = useSSEStream();
    await sse.startStream(stream);

    expect(sse.reference.value?.chunks).toHaveLength(1);
  });

  it('captures reference even when the bytes of the final message are split across many tiny read() chunks', async () => {
    // Worst case: TCP segmentation may deliver one byte at a time. Verifies
    // the buffering loop reassembles JSON correctly across read() boundaries.
    const finalMessage =
      'data:{"code":0,"data":{"answer":"","reference":{"chunks":[{"id":"split","content":"v"}]}}}\n\ndata:{"code":0,"data":true}\n\n';
    const stream = makeStream([...finalMessage]); // one char per chunk

    const sse = useSSEStream();
    await sse.startStream(stream);

    expect(sse.reference.value?.chunks).toHaveLength(1);
    expect(sse.reference.value?.chunks[0]?.id).toBe('split');
  });

  it('captures reference when the final SSE message ends without a trailing newline and the stream closes immediately', async () => {
    // The most pessimistic real-world case: server flushes the final big
    // message and closes the connection before the trailing \n\n bytes
    // would have been sent. This is the buffer-flush-on-done scenario.
    const finalMessage =
      'data:{"code":0,"data":{"answer":"","reference":{"chunks":[{"id":"flush","content":"v"}]}}}';
    const stream = makeStream([finalMessage]); // no trailing \n at all

    const sse = useSSEStream();
    await sse.startStream(stream);

    expect(sse.reference.value?.chunks).toHaveLength(1);
    expect(sse.reference.value?.chunks[0]?.id).toBe('flush');
  });
});
