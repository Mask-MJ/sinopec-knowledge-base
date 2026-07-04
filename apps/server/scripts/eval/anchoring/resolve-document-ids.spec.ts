import type { ProjectAnchor } from './anchor-registry';

import { describe, expect, it } from 'vitest';

import { resolveDocumentIds } from './resolve-document-ids';

const docs = [
  { id: 'd1', name: '顺北43三维地震采集报告.docx' },
  { id: 'd2', name: '顺北42采集施工总结.docx' },
  { id: 'd3', name: '顺北43井区工程设计.docx' },
];

const sb43: ProjectAnchor = {
  projectName: '顺北43',
  aliases: ['顺北43井区'],
  wellNumbers: ['顺北43'],
};

describe('resolveDocumentIds', () => {
  it('returns ids of docs whose name matches the anchor', () => {
    expect(resolveDocumentIds(sb43, docs)).toEqual(['d1', 'd3']);
  });

  it('does not match a neighbouring project doc', () => {
    expect(resolveDocumentIds(sb43, docs)).not.toContain('d2');
  });

  it('returns empty array when nothing matches', () => {
    const other: ProjectAnchor = {
      projectName: '张集东',
      aliases: [],
      wellNumbers: [],
    };
    expect(resolveDocumentIds(other, docs)).toEqual([]);
  });
});
