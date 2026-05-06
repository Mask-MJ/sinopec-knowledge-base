import type { RagflowChunk, RagflowRawMessage } from './normalize-reference';

import { describe, expect, it } from 'vitest';

import { normalizeMessageReferences } from './normalize-reference';

const chunk = (overrides: Partial<RagflowChunk> = {}): RagflowChunk => ({
  id: overrides.id ?? 'c1',
  content: overrides.content ?? 'content',
  dataset_id: overrides.dataset_id ?? 'd1',
  doc_type: overrides.doc_type ?? '',
  document_id: overrides.document_id ?? 'doc-A',
  document_name: overrides.document_name ?? 'A.docx',
  image_id: overrides.image_id ?? '',
  positions: overrides.positions ?? [],
  similarity: overrides.similarity ?? 0.9,
  term_similarity: overrides.term_similarity ?? 0.5,
  url: overrides.url ?? null,
  vector_similarity: overrides.vector_similarity ?? 0.7,
  ...overrides,
});

describe('normalizeMessageReferences (RAGFlow off-by-one shift fix)', () => {
  it('1-round session: ref RAGFlow misplaced on opener gets shifted to a1', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: '你好！我是你的助理，有什么可以帮到你的吗？',
        reference: [chunk({ id: 'real-a1-ref' })],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1 [ID:0]' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks).toHaveLength(1);
    expect(result[2]?.reference?.chunks[0]?.id).toBe('real-a1-ref');
  });

  it('multi-round session: each assistant gets the chunks RAGFlow misplaced on the previous assistant', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'real-a1' })],
      },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1 [ID:0]',
        reference: [chunk({ id: 'real-a2' })],
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2 [ID:0]' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks[0]?.id).toBe('real-a1');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('real-a2');
  });

  it('three-round session: shift propagates correctly through all assistants', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'r-for-a1' })],
      },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'r-for-a2' })],
      },
      { role: 'user', content: 'q2' },
      {
        role: 'assistant',
        content: 'a2',
        reference: [chunk({ id: 'r-for-a3' })],
      },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks[0]?.id).toBe('r-for-a1');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('r-for-a2');
    expect(result[6]?.reference?.chunks[0]?.id).toBe('r-for-a3');
  });

  it('builds doc_aggs from shifted chunks aggregated by document_id', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c2', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c3', document_id: 'doc-B', document_name: 'B.docx' }),
        ],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[2]?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('opener-only new session (no user yet): no reference attached anywhere', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: '你好！',
        reference: [chunk({ id: 'leftover' })],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
  });

  it('all assistants empty reference (RAGFlow gave none): all dropped', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'opener' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]).not.toHaveProperty('reference');
  });

  it('user messages pass through untouched', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'r' })],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).toEqual({ role: 'user', content: 'q1' });
  });

  it('empty reference array on an assistant is treated as no reference (no shift contribution)', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'opener', reference: [] },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'real-a2' })],
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]).not.toHaveProperty('reference');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('real-a2');
  });

  it('does not mutate the input array', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'r' })],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const snapshot = structuredClone(raw);
    normalizeMessageReferences(raw);
    expect(raw).toEqual(snapshot);
  });
});
