/** 单 doc 内 PUT chunk 的分批并发数(processBatch) */
export const CONCURRENCY = Number(process.env.CHUNK_TAG_CONCURRENCY ?? 5);

/** 单 chunk 最多写入的 important_keywords 数 */
export const MAX_KEYWORDS = Number(process.env.CHUNK_TAG_MAX_KEYWORDS ?? 30);

/** KeywordMatcher 的 DI 注入 token */
export const KEYWORD_MATCHER = Symbol('KEYWORD_MATCHER');

/** 轮询待办间隔(ms) */
export const POLL_INTERVAL_MS = Number(
  process.env.CHUNK_TAG_POLL_INTERVAL_MS ?? 30_000,
);

/** 仅 RUNNING/UNSTART 未完成的最长等待(ms),超时弃置并告警 */
export const JOB_TIMEOUT_MS = Number(
  process.env.CHUNK_TAG_JOB_TIMEOUT_MS ?? 7_200_000,
);

/**
 * RAGFlow 文档 parse 状态。
 * SDK 端点 `GET /api/v1/datasets/:id/documents` 返回前已把 DB 数字
 * (0..4) 映射为文本;SCHEDULE(5) 未映射会原样返回 '5',落"未知"分支保留。
 */
export const RUN = {
  UNSTART: 'UNSTART',
  RUNNING: 'RUNNING',
  CANCEL: 'CANCEL',
  DONE: 'DONE',
  FAIL: 'FAIL',
} as const;

export type RunStatus = (typeof RUN)[keyof typeof RUN];
