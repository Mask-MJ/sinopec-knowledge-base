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

describe('normalizeMessageReferences', () => {
  it('wraps a flat chunk array into { chunks, doc_aggs }', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1 [ID:0]',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
        ],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]?.reference).toEqual({
      chunks: [
        chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
      ],
      doc_aggs: [{ doc_id: 'doc-A', doc_name: 'A.docx', count: 1 }],
    });
  });

  it('aggregates doc_aggs by document_id and counts chunks per document', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c2', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c3', document_id: 'doc-B', document_name: 'B.docx' }),
        ],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('drops reference field when absent (RAGFlow streaming-truncated message)', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'truncated' },
    ];
    expect(normalizeMessageReferences(raw)[0]).not.toHaveProperty('reference');
  });

  it('drops reference field when array is empty', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'no refs', reference: [] },
    ];
    expect(normalizeMessageReferences(raw)[0]).not.toHaveProperty('reference');
  });

  it('passes user messages through untouched', () => {
    const raw: RagflowRawMessage[] = [{ role: 'user', content: 'q1' }];
    expect(normalizeMessageReferences(raw)[0]).toEqual({
      role: 'user',
      content: 'q1',
    });
  });

  it('does not mutate the input array', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'c1' })],
      },
    ];
    const snapshot = structuredClone(raw);
    normalizeMessageReferences(raw);
    expect(raw).toEqual(snapshot);
  });
});
