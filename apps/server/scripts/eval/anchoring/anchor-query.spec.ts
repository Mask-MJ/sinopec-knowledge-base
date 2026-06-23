import type { ProjectAnchor } from './anchor-registry';

import { describe, expect, it } from 'vitest';

import { anchorQuery } from './anchor-query';

const anchor: ProjectAnchor = {
  projectName: '顺北43',
  aliases: ['顺北43井区'],
  wellNumbers: ['顺北43'],
};

describe('anchorQuery', () => {
  it('passes through unchanged when anchor is null', () => {
    const q = '本工区的覆盖次数是多少';
    expect(anchorQuery(q, null)).toBe(q);
  });

  it('weaves project name + well numbers into the query', () => {
    const q = '施工日期是什么';
    const result = anchorQuery(q, anchor);
    expect(result).toContain('顺北43');
    expect(result).toContain(q);
    expect(result).not.toBe(q);
  });

  it('does not mutate the input anchor', () => {
    const snapshot = structuredClone(anchor);
    anchorQuery('施工日期', anchor);
    expect(anchor).toEqual(snapshot);
  });
});
