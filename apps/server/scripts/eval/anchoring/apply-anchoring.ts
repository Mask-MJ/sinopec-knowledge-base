import type { ProjectAnchor } from './anchor-registry';

import { anchorQuery } from './anchor-query';
import { detectAnchor } from './detect-anchor';
import { resolveDocumentIds } from './resolve-document-ids';

export type AnchorMode = 'filter' | 'off' | 'rewrite';

export interface AnchoredRetrieval {
  anchor: null | ProjectAnchor;
  documentIds?: string[];
  question: string;
}

export function applyAnchoring(
  question: string,
  registry: ProjectAnchor[],
  datasetDocs: { id: string; name: string }[],
  mode: AnchorMode,
): AnchoredRetrieval {
  if (mode === 'off') {
    return { question, anchor: null };
  }
  const anchor = detectAnchor(question, registry);
  if (!anchor) {
    return { question, anchor: null };
  }
  if (mode === 'rewrite') {
    return { question: anchorQuery(question, anchor), anchor };
  }
  const documentIds = resolveDocumentIds(anchor, datasetDocs);
  return {
    question,
    anchor,
    documentIds: documentIds.length > 0 ? documentIds : undefined,
  };
}
