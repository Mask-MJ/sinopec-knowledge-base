/** 单 doc 内 PUT chunk 的分批并发数(processBatch) */
export const CONCURRENCY = Number(process.env.CHUNK_TAG_CONCURRENCY ?? 5);

/** 单 chunk 最多写入的 important_keywords 数 */
export const MAX_KEYWORDS = Number(process.env.CHUNK_TAG_MAX_KEYWORDS ?? 30);

/** KeywordMatcher 的 DI 注入 token */
export const KEYWORD_MATCHER = Symbol('KEYWORD_MATCHER');
