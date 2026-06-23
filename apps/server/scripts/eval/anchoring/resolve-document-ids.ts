import type { ProjectAnchor } from './anchor-registry';

/**
 * 把锚点 token（projectName/aliases/wellNumbers）与 dataset 文档名匹配，返回命中的 id。
 * 纯匹配、零 IO；datasetDocs 由调用方拉好后传入。无命中返回 []。
 */
export function resolveDocumentIds(
  anchor: ProjectAnchor,
  datasetDocs: { id: string; name: string }[],
): string[] {
  const tokens = [
    anchor.projectName,
    ...anchor.aliases,
    ...anchor.wellNumbers,
  ].filter((token) => token.length > 0);
  const ids: string[] = [];
  for (const doc of datasetDocs) {
    if (tokens.some((token) => doc.name.includes(token))) {
      ids.push(doc.id);
    }
  }
  return [...new Set(ids)];
}
