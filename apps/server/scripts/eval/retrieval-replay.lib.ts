// cspell:disable-file
// scripts/eval/ 是开发评测工具，file-level disable 说明见 run.ts。

import { normalizeDocName } from './scoring';

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
