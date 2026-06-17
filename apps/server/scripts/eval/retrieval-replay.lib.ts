// cspell:disable-file
// scripts/eval/ 是开发评测工具，file-level disable 说明见 run.ts。

import type { QuestionRef } from './scoring';

import { normalizeDocName, scoreRetrieval } from './scoring';

export function parseIdList(csv: string): number[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

export interface ReplayRetrievalParams {
  keyword?: boolean;
  rerankId?: string;
  similarityThreshold?: number;
  topK?: number;
  topN?: number;
  vectorSimilarityWeight?: number;
}

export function buildReplayBody(
  question: string,
  datasetIds: string[],
  retrieval: ReplayRetrievalParams,
  k: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    question,
    dataset_ids: datasetIds,
    top_k: retrieval.topK ?? 1024,
    similarity_threshold: retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: retrieval.vectorSimilarityWeight ?? 0.3,
    keyword: retrieval.keyword ?? false,
    page: 1,
    page_size: k,
    highlight: true,
  };
  if (retrieval.rerankId) body.rerank_id = retrieval.rerankId;
  return body;
}

export interface ReplayChunk {
  content: string;
  documentName: string;
  importantKeywords: string[];
  positions?: number[];
  rank: number;
  similarity?: number;
  termSimilarity?: number;
  vectorSimilarity?: number;
}

export function mapChunk(raw: Record<string, any>, index: number): ReplayChunk {
  const kw = raw.important_keywords ?? raw.important_kwd ?? [];
  return {
    rank: index + 1,
    documentName:
      raw.document_keyword ?? raw.document_name ?? raw.docnm_kwd ?? '',
    content: raw.content ?? raw.content_with_weight ?? '',
    importantKeywords: Array.isArray(kw) ? kw.filter(Boolean) : [],
    similarity: raw.similarity,
    vectorSimilarity: raw.vector_similarity,
    termSimilarity: raw.term_similarity,
    positions: raw.positions,
  };
}

export function truncateContent(text: string, max = 200): string {
  const flat = text.replaceAll(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

export function isGoldDoc(documentName: string, refDoc: string): boolean {
  if (!refDoc || !documentName) return false;
  const cand = normalizeDocName(documentName);
  const ref = normalizeDocName(refDoc);
  if (!cand || !ref) return false;
  return cand.includes(ref) || ref.includes(cand);
}

/**
 * 自聚合：从本次召回的 chunks 直接统计每文档命中数（确定性、纯、可单测，
 * 反映当前 page_size 下实际取回的分布）。刻意不读 RAGFlow 响应顶层的
 * doc_aggs 字段——见 design review，属有意选择而非疏漏。
 */
export function aggregateDocs(
  chunks: ReplayChunk[],
): { count: number; doc: string }[] {
  const m = new Map<string, number>();
  for (const c of chunks)
    m.set(c.documentName, (m.get(c.documentName) ?? 0) + 1);
  return [...m.entries()]
    .map(([doc, count]) => ({ doc, count }))
    .sort((a, b) => b.count - a.count);
}

export interface QuestionSectionInput {
  chunks: ReplayChunk[];
  error?: string;
  qid: number;
  question: string;
  reference: QuestionRef;
  topic: string;
  topN: number;
}

function fmt(n?: number): string {
  return typeof n === 'number' ? n.toFixed(2) : '-';
}

function renderChunkRow(c: ReplayChunk, refDoc: string): string {
  const gold = isGoldDoc(c.documentName, refDoc) ? '✅' : '';
  const kw = c.importantKeywords.slice(0, 6).join(',');
  return `| ${c.rank} | ${fmt(c.similarity)} | ${fmt(c.vectorSimilarity)} | ${fmt(c.termSimilarity)} | ${c.documentName} | ${gold} | ${kw} | ${truncateContent(c.content)} |`;
}

export function renderQuestionSection(input: QuestionSectionInput): string {
  const { chunks, error, qid, question, reference, topic, topN } = input;
  const lines: string[] = [];
  lines.push(
    `## Q${qid} · ${topic}`,
    '',
    `**问题**:${question}`,
    '',
    `**Gold**:doc=${reference.doc || '(无)'} | section=${reference.section || '(无)'}`,
    '',
  );

  if (error) {
    lines.push(`⚠ 检索失败:${error}`, '');
    return lines.join('\n');
  }
  if (chunks.length === 0) {
    lines.push('（无召回结果）', '');
    return lines.join('\n');
  }

  const score = scoreRetrieval(
    chunks.map((c) => ({ documentName: c.documentName })),
    reference,
  );
  lines.push(
    `**文档级命中**:matched=${score.matched} rank=${score.rank} hit@1=${score.hitAt1} hit@3=${score.hitAt3} MRR=${score.mrr.toFixed(2)}`,
    '',
    '| # | sim | vec | term | 来源文档 | gold? | important_keywords | content 摘要 |',
    '|---|-----|-----|------|----------|-------|--------------------|-------------|',
  );
  for (const c of chunks) {
    lines.push(renderChunkRow(c, reference.doc));
    if (c.rank === topN && chunks.length > topN) {
      lines.push(
        `| — | — | — | — | ─── top_n=${topN} 截断线(以下不进 LLM)─── | — | — | — |`,
      );
    }
  }
  const aggs = aggregateDocs(chunks);
  lines.push(
    '',
    `**doc_aggs**:${aggs.map((a) => `${a.doc}×${a.count}`).join(' / ')}`,
    '',
  );
  return lines.join('\n');
}

export interface ReportMeta {
  experimentId: string;
  generatedAt: string;
  ids: number[];
  k: number;
  retrieval: ReplayRetrievalParams;
}

export function renderReport(meta: ReportMeta, sections: string[]): string {
  const head: string[] = [
    `# 检索回放:${meta.experimentId}`,
    '',
    `Generated: ${meta.generatedAt}`,
    '',
    `Question ids: ${meta.ids.join(', ')}  |  k(page_size): ${meta.k}`,
    '',
    '## 检索参数',
    '```json',
    JSON.stringify(meta.retrieval, null, 2),
    '```',
    '',
  ];
  return `${head.join('\n')}\n${sections.join('\n')}\n`;
}
