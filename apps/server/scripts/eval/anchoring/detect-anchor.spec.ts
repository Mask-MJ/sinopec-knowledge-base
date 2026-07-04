import type { ProjectAnchor } from './anchor-registry';

import { describe, expect, it } from 'vitest';

import { detectAnchor } from './detect-anchor';

const registry: ProjectAnchor[] = [
  {
    projectName: '顺北43',
    aliases: ['顺北43井区', 'SB43'],
    wellNumbers: ['顺北43'],
  },
  {
    projectName: '顺北42',
    aliases: ['顺北42井区', 'SB42'],
    wellNumbers: ['顺北42'],
  },
  { projectName: '张集东', aliases: ['张集东三维'], wellNumbers: [] },
  { projectName: '页岩气', aliases: ['页岩气地震攻关'], wellNumbers: [] },
];

describe('detectAnchor', () => {
  it('matches by well number', () => {
    expect(detectAnchor('顺北43的施工日期是什么', registry)?.projectName).toBe(
      '顺北43',
    );
  });

  it('matches by alias', () => {
    expect(detectAnchor('张集东三维的难点有哪些', registry)?.projectName).toBe(
      '张集东',
    );
  });

  it('matches by project name', () => {
    expect(detectAnchor('页岩气项目的观测系统', registry)?.projectName).toBe(
      '页岩气',
    );
  });

  it('returns null when no project is named', () => {
    expect(detectAnchor('本工区的覆盖次数是多少', registry)).toBeNull();
  });

  it('returns null on equal-specificity ambiguity', () => {
    expect(detectAnchor('顺北42和顺北43的对比', registry)).toBeNull();
  });
});
