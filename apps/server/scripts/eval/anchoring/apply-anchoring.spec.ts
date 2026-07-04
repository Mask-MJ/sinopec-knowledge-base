import type { ProjectAnchor } from './anchor-registry';

import { describe, expect, it } from 'vitest';

import { applyAnchoring } from './apply-anchoring';

const registry: ProjectAnchor[] = [
  { projectName: '顺北43', aliases: ['顺北43井区'], wellNumbers: ['顺北43'] },
];
const docs = [
  { id: 'd1', name: '顺北43三维采集报告.docx' },
  { id: 'd2', name: '顺北42采集.docx' },
];

describe('applyAnchoring', () => {
  it('mode off → passthrough, no anchor', () => {
    const r = applyAnchoring('顺北43的施工日期', registry, docs, 'off');
    expect(r.question).toBe('顺北43的施工日期');
    expect(r.anchor).toBeNull();
    expect(r.documentIds).toBeUndefined();
  });

  it('mode rewrite + match → rewritten question, anchor set', () => {
    const r2 = applyAnchoring('顺北43的施工日期', registry, docs, 'rewrite');
    expect(r2.anchor?.projectName).toBe('顺北43');
    expect(r2.question).toContain('顺北43');
    expect(r2.question).not.toBe('顺北43的施工日期');
    // 无锚词 → 直通
    const r1 = applyAnchoring('施工日期是什么', registry, docs, 'rewrite');
    expect(r1.anchor).toBeNull();
  });

  it('mode filter + match → documentIds set, question unchanged', () => {
    const r = applyAnchoring('顺北43的施工日期', registry, docs, 'filter');
    expect(r.documentIds).toEqual(['d1']);
    expect(r.question).toBe('顺北43的施工日期');
  });

  it('no anchor → passthrough regardless of mode', () => {
    const r = applyAnchoring('本工区覆盖次数', registry, docs, 'filter');
    expect(r.anchor).toBeNull();
    expect(r.documentIds).toBeUndefined();
  });
});
