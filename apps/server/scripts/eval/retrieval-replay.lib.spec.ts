// cspell:disable-file
import { describe, expect, it } from 'vitest';

import { buildReplayBody, mapChunk, parseIdList } from './retrieval-replay.lib';

describe('parseIdList', () => {
  it('parses a csv of ids', () => {
    expect(parseIdList('6,14,18')).toEqual([6, 14, 18]);
  });
  it('trims spaces and drops empties', () => {
    expect(parseIdList(' 4, 8 ,,19 ')).toEqual([4, 8, 19]);
  });
  it('drops non-integer tokens', () => {
    expect(parseIdList('1,foo,3')).toEqual([1, 3]);
  });
  it('returns [] for empty string', () => {
    expect(parseIdList('')).toEqual([]);
  });
});

describe('buildReplayBody', () => {
  it('fills defaults and sets page_size=k, highlight=true', () => {
    const body = buildReplayBody('q?', ['ds1'], {}, 30);
    expect(body).toMatchObject({
      question: 'q?',
      dataset_ids: ['ds1'],
      top_k: 1024,
      similarity_threshold: 0.2,
      vector_similarity_weight: 0.3,
      keyword: false,
      page: 1,
      page_size: 30,
      highlight: true,
    });
    expect(body.rerank_id).toBeUndefined();
  });
  it('honors provided retrieval params and rerankId', () => {
    const body = buildReplayBody(
      'q?',
      ['ds1'],
      {
        topK: 256,
        similarityThreshold: 0.35,
        vectorSimilarityWeight: 0.5,
        keyword: true,
        rerankId: 'rk1',
      },
      10,
    );
    expect(body).toMatchObject({
      top_k: 256,
      similarity_threshold: 0.35,
      vector_similarity_weight: 0.5,
      keyword: true,
      page_size: 10,
      rerank_id: 'rk1',
    });
  });
});

describe('mapChunk', () => {
  it('keeps content, keywords, scores; rank = index + 1', () => {
    const raw = {
      content: 'hello',
      document_keyword: 'docA.docx',
      important_keywords: ['kw1', 'kw2'],
      similarity: 0.57,
      vector_similarity: 0.73,
      term_similarity: 0.5,
      positions: [1, 2],
    };
    expect(mapChunk(raw, 0)).toEqual({
      rank: 1,
      documentName: 'docA.docx',
      content: 'hello',
      importantKeywords: ['kw1', 'kw2'],
      similarity: 0.57,
      vectorSimilarity: 0.73,
      termSimilarity: 0.5,
      positions: [1, 2],
    });
  });
  it('falls back across field name aliases', () => {
    const raw = {
      docnm_kwd: 'docB',
      content_with_weight: 'w',
      important_kwd: ['k'],
    };
    const c = mapChunk(raw, 4);
    expect(c.rank).toBe(5);
    expect(c.documentName).toBe('docB');
    expect(c.content).toBe('w');
    expect(c.importantKeywords).toEqual(['k']);
  });
  it('defaults missing fields to empty', () => {
    const c = mapChunk({}, 0);
    expect(c.documentName).toBe('');
    expect(c.content).toBe('');
    expect(c.importantKeywords).toEqual([]);
  });
});
