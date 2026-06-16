/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, unicorn/no-process-exit, turbo/no-undeclared-env-vars */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，file-level disable 说明见 run.ts。

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
