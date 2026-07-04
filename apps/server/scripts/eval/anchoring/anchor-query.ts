import type { ProjectAnchor } from './anchor-registry';

/**
 * 锚点为 null 时直通；否则把规范项目名 + 井号作为关键词 token 前置织入原 question，
 * 偏置 BM25（关键词权重 0.7 主导）向锚定项目。不可变。
 */
export function anchorQuery(
  question: string,
  anchor: null | ProjectAnchor,
): string {
  if (!anchor) {
    return question;
  }
  const keywords = [anchor.projectName, ...anchor.wellNumbers].filter(
    (token) => token.length > 0,
  );
  const unique = [...new Set(keywords)];
  return `${unique.join(' ')} ${question}`;
}
