import type { ReplayChunk } from './retrieval-replay.lib';

// cspell:disable-file
import { describe, expect, it } from 'vitest';

import {
  aggregateDocs,
  buildReplayBody,
  isGoldDoc,
  mapChunk,
  parseIdList,
  renderQuestionSection,
  renderReport,
  truncateContent,
} from './retrieval-replay.lib';

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

describe('truncateContent', () => {
  it('collapses whitespace/newlines and keeps short text', () => {
    expect(truncateContent('a\n b\tc')).toBe('a b c');
  });
  it('truncates with ellipsis at max', () => {
    expect(truncateContent('abcdef', 3)).toBe('abc…');
  });
});

describe('isGoldDoc', () => {
  it('matches via normalized containment (extension/space-insensitive)', () => {
    expect(
      isGoldDoc('2022 顺北43 总结报告_noimg.docx', '2022顺北43总结报告'),
    ).toBe(true);
  });
  it('returns false for unrelated docs', () => {
    expect(isGoldDoc('页岩气采集报告', '顺北43总结报告')).toBe(false);
  });
  it('returns false when either side empty', () => {
    expect(isGoldDoc('', 'x')).toBe(false);
    expect(isGoldDoc('x', '')).toBe(false);
  });
});

const chunk = (rank: number, documentName: string): ReplayChunk => ({
  rank,
  documentName,
  content: '',
  importantKeywords: [],
});

describe('aggregateDocs', () => {
  it('counts per document, sorted desc by count', () => {
    const chunks = [chunk(1, 'A'), chunk(2, 'B'), chunk(3, 'A'), chunk(4, 'A')];
    expect(aggregateDocs(chunks)).toEqual([
      { doc: 'A', count: 3 },
      { doc: 'B', count: 1 },
    ]);
  });
  it('returns [] for no chunks', () => {
    expect(aggregateDocs([])).toEqual([]);
  });
});

const ref = { doc: '顺北43总结报告', section: '2.1 起止日期' };

describe('renderQuestionSection', () => {
  it('renders table, gold mark, and top_n cut line after row N', () => {
    const chunks: ReplayChunk[] = [
      {
        rank: 1,
        documentName: '页岩气报告',
        content: 'x',
        importantKeywords: [],
        similarity: 0.4,
        vectorSimilarity: 0.4,
        termSimilarity: 0.4,
      },
      {
        rank: 2,
        documentName: '顺北43总结报告',
        content: 'y',
        importantKeywords: ['起止日期'],
        similarity: 0.5,
        vectorSimilarity: 0.5,
        termSimilarity: 0.5,
      },
      {
        rank: 3,
        documentName: '其它',
        content: 'z',
        importantKeywords: [],
        similarity: 0.3,
        vectorSimilarity: 0.3,
        termSimilarity: 0.3,
      },
    ];
    const md = renderQuestionSection({
      qid: 14,
      topic: 'shunbei43',
      question: 'q?',
      reference: ref,
      chunks,
      topN: 2,
    });
    expect(md).toContain('## Q14');
    expect(md).toContain('| # | sim | vec | term |');
    expect(md).toMatch(/top_n=2 截断线/);
    // gold doc row marked
    expect(md).toMatch(/顺北43总结报告.*✅/);
    // doc_aggs footer present
    expect(md).toContain('doc_aggs');
  });
  it('renders error branch without table', () => {
    const md = renderQuestionSection({
      qid: 6,
      topic: 't',
      question: 'q',
      reference: ref,
      chunks: [],
      topN: 10,
      error: 'boom',
    });
    expect(md).toContain('⚠ 检索失败:boom');
    expect(md).not.toContain('| # | sim');
  });
  it('renders empty-recall branch', () => {
    const md = renderQuestionSection({
      qid: 6,
      topic: 't',
      question: 'q',
      reference: ref,
      chunks: [],
      topN: 10,
    });
    expect(md).toContain('（无召回结果）');
  });
});

describe('renderReport', () => {
  it('includes header, params, and sections', () => {
    const md = renderReport(
      {
        experimentId: 'exp1',
        generatedAt: '2026-06-16T00:00:00Z',
        retrieval: { topN: 10 },
        ids: [6, 14],
        k: 30,
      },
      ['## Q6 body', '## Q14 body'],
    );
    expect(md).toContain('# 检索回放:exp1');
    expect(md).toContain('Generated: 2026-06-16T00:00:00Z');
    expect(md).toContain('"topN": 10');
    expect(md).toContain('## Q6 body');
  });
});
