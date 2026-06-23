import type { ProjectAnchor } from './anchor-registry';

interface ScoredAnchor {
  anchor: ProjectAnchor;
  score: number;
}

/**
 * 最具体匹配：扫 projectName/aliases/wellNumbers，命中 token 的最大长度作 specificity。
 * 无命中返回 null；存在两个同最高 specificity 的锚点（歧义）也返回 null（安全优先）。
 */
export function detectAnchor(
  question: string,
  registry: ProjectAnchor[],
): ProjectAnchor | null {
  const matches: ScoredAnchor[] = [];
  for (const anchor of registry) {
    const tokens = [
      anchor.projectName,
      ...anchor.aliases,
      ...anchor.wellNumbers,
    ];
    let score = 0;
    for (const token of tokens) {
      if (token.length > 0 && question.includes(token)) {
        score = Math.max(score, token.length);
      }
    }
    if (score > 0) {
      matches.push({ anchor, score });
    }
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => b.score - a.score);
  if (matches.length > 1 && matches[1].score === matches[0].score) {
    return null;
  }
  return matches[0].anchor;
}
