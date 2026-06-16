// cspell:disable-file
import { describe, expect, it } from 'vitest';

import { buildReplayBody, parseIdList } from './retrieval-replay.lib';

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
