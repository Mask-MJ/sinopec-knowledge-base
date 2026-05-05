// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import { describe, expect, it } from 'vitest';

import {
  cleanText,
  findNumberTokens,
  matchesFact,
  matchesNotContain,
  normalizeDocName,
  normalizeUnit,
  normalizeWell,
  numbersEqual,
  parseNumber,
  scoreAnswer,
  scoreRetrieval,
  unitsCompatible,
} from './scoring';

describe('cleanText', () => {
  it('strips RAGFlow citation markers [ID:N]', () => {
    expect(cleanText('炮数 63750[ID:0]，实际 63787[ID:5]')).toBe(
      '炮数 63750，实际 63787',
    );
  });

  it('strips numeric citation markers [N] and [N][M]', () => {
    expect(cleanText('数据[3]来源[4][5]详细')).toBe('数据来源详细');
  });

  it('strips comma-joined citation markers [1,2,3]', () => {
    expect(cleanText('参考[1, 2, 3]文献')).toBe('参考文献');
  });

  it('strips markdown bold **X** and __X__', () => {
    expect(cleanText('**重要**字段 __标识__')).toBe('重要字段 标识');
  });

  it('collapses multiple spaces', () => {
    expect(cleanText('a    b')).toBe('a b');
  });

  it('preserves Chinese punctuation', () => {
    expect(cleanText('设计：63750炮，实际：63787炮。')).toBe(
      '设计：63750炮，实际：63787炮。',
    );
  });
});

describe('parseNumber', () => {
  it('parses plain integers', () => {
    expect(parseNumber('63750')).toBe(63_750);
  });

  it('parses thousands separator', () => {
    expect(parseNumber('63,750')).toBe(63_750);
  });

  it('parses decimals', () => {
    expect(parseNumber('550.8')).toBe(550.8);
  });

  it('parses 万', () => {
    expect(parseNumber('6.3 万')).toBe(63_000);
    expect(parseNumber('6.3万')).toBe(63_000);
  });

  it('parses 亿', () => {
    expect(parseNumber('1.21 亿')).toBe(121_000_000);
  });

  it('strips 约 prefix', () => {
    expect(parseNumber('约 63750')).toBe(63_750);
    expect(parseNumber('约63750')).toBe(63_750);
  });

  it('strips ± error range, keeps main value', () => {
    expect(parseNumber('63750±50')).toBe(63_750);
  });

  it('returns null for non-numeric', () => {
    expect(parseNumber('六万三千')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('normalizeUnit', () => {
  it('maps Chinese length to m', () => {
    expect(normalizeUnit('米')).toBe('m');
    expect(normalizeUnit('m')).toBe('m');
  });

  it('maps area variants to km²', () => {
    expect(normalizeUnit('km²')).toBe('km²');
    expect(normalizeUnit('km2')).toBe('km²');
    expect(normalizeUnit('km^2')).toBe('km²');
    expect(normalizeUnit('平方千米')).toBe('km²');
    expect(normalizeUnit('平方公里')).toBe('km²');
  });

  it('handles undefined', () => {
    expect(normalizeUnit(undefined)).toBe('');
    expect(normalizeUnit(null)).toBe('');
  });
});

describe('normalizeWell', () => {
  it('strips dashes and spaces, uppercases', () => {
    expect(normalizeWell('SB-21-J-01')).toBe('SB21J01');
    expect(normalizeWell('sb21j01')).toBe('SB21J01');
    expect(normalizeWell('SB 21 J 01')).toBe('SB21J01');
  });
});

describe('normalizeDocName', () => {
  it('strips _noimg and extension', () => {
    expect(normalizeDocName('2024年顺北21井三维项目报告_noimg.docx')).toBe(
      '2024年顺北21井三维项目报告',
    );
  });

  it('strips spaces and lowercases', () => {
    expect(normalizeDocName('Test Report.pdf')).toBe('testreport');
  });
});

describe('numbersEqual', () => {
  it('treats 63750 and 63750.0 as equal', () => {
    expect(numbersEqual(63_750, 63_750)).toBe(true);
  });

  it('treats 63786 and 63787 as NOT equal (no tolerance)', () => {
    expect(numbersEqual(63_786, 63_787)).toBe(false);
  });
});

describe('findNumberTokens', () => {
  it('extracts number+unit pairs', () => {
    const tokens = findNumberTokens(
      '设计满覆盖面积：550.8km²，激发面积：839.85 km²',
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ num: 550.8, unit: 'km²' });
    expect(tokens[1]).toMatchObject({ num: 839.85, unit: 'km²' });
  });

  it('extracts bare numbers', () => {
    const tokens = findNumberTokens('炮数 63750');
    expect(tokens.some((t) => t.num === 63_750)).toBe(true);
  });
});

describe('matchesFact (number)', () => {
  it('exact equality, no tolerance', () => {
    const fact = { pattern: '63787', type: 'number' as const };
    expect(matchesFact('实际生产炮数：63787炮', fact)).toBe(true);
    expect(matchesFact('实际生产炮数：63786炮', fact)).toBe(false);
  });

  it('respects unit constraint', () => {
    const fact = { pattern: '550.8', type: 'number' as const, unit: 'km²' };
    expect(matchesFact('面积 550.8 km²', fact)).toBe(true);
    expect(matchesFact('面积 550.8 m', fact)).toBe(false);
  });

  it('handles unit aliases (米 vs m)', () => {
    const fact = { pattern: '0.101', type: 'number' as const, unit: 'm' };
    expect(matchesFact('闭合差 0.101 米', fact)).toBe(true);
  });

  it('handles thousands separator in answer', () => {
    const fact = { pattern: '63750', type: 'number' as const };
    expect(matchesFact('炮数 63,750', fact)).toBe(true);
  });

  it('matches 6.3 万 against 63000', () => {
    const fact = { pattern: '63000', type: 'number' as const };
    expect(matchesFact('约 6.3 万', fact)).toBe(true);
  });
});

describe('matchesFact (string / well)', () => {
  it('matches plain substring', () => {
    const fact = { pattern: '一升一降三确保', type: 'string' as const };
    expect(matchesFact('技术对策"一升一降三确保"', fact)).toBe(true);
  });

  it('matches well number with separators', () => {
    const fact = { pattern: 'SB21J01', type: 'string' as const };
    expect(matchesFact('控制点 SB-21-J-01 已布设', fact)).toBe(true);
    expect(matchesFact('控制点 SB21J01 已布设', fact)).toBe(true);
    expect(matchesFact('控制点 SB21J05 已布设', fact)).toBe(false);
  });
});

describe('matchesNotContain', () => {
  it('detects forbidden substring', () => {
    const item = { pattern: '60300', type: 'string' as const };
    expect(matchesNotContain('炮数 60300', item)).toBe(true);
    expect(matchesNotContain('炮数 63787', item)).toBe(false);
  });
});

describe('scoreRetrieval', () => {
  it('hits at rank 1 → hit@1=1, hit@3=1, MRR=1', () => {
    const r = scoreRetrieval(
      [{ documentName: '2024年顺北21井试验报告_noimg.docx' }],
      { doc: '2024年顺北21井试验报告', section: '2.地质任务' },
    );
    expect(r).toMatchObject({
      matched: true,
      rank: 1,
      hitAt1: 1,
      hitAt3: 1,
      mrr: 1,
    });
  });

  it('hits at rank 4 → hit@1=0, hit@3=0, hit@N=1, MRR=0.25', () => {
    const r = scoreRetrieval(
      [
        { documentName: 'irrelevant1.docx' },
        { documentName: 'irrelevant2.docx' },
        { documentName: 'irrelevant3.docx' },
        { documentName: '2024年顺北21井试验报告.docx' },
      ],
      { doc: '2024年顺北21井试验报告', section: '' },
    );
    expect(r).toMatchObject({
      matched: true,
      rank: 4,
      hitAt1: 0,
      hitAt3: 0,
      hitAtN: 1,
    });
    expect(r.mrr).toBeCloseTo(0.25);
  });

  it('no match → all zeros', () => {
    const r = scoreRetrieval([{ documentName: 'unrelated.docx' }], {
      doc: '2024年顺北21井试验报告',
      section: '',
    });
    expect(r).toMatchObject({
      matched: false,
      rank: 0,
      hitAt1: 0,
      hitAt3: 0,
      mrr: 0,
    });
  });

  it('handles empty chunks', () => {
    const r = scoreRetrieval([], { doc: 'X', section: '' });
    expect(r.matched).toBe(false);
  });
});

describe('scoreAnswer', () => {
  it('all hits → score 1.0', () => {
    const r = scoreAnswer(
      '炮数 63750 实际 63787',
      [
        { pattern: '63750', type: 'number' },
        { pattern: '63787', type: 'number' },
      ],
      [],
    );
    expect(r.finalScore).toBe(1);
    expect(r.criticalMissing).toBe(false);
  });

  it('half hit → 0.5', () => {
    const r = scoreAnswer(
      '炮数 63750',
      [
        { pattern: '63750', type: 'number' },
        { pattern: '63787', type: 'number' },
      ],
      [],
    );
    expect(r.mustContainScore).toBe(0.5);
    expect(r.finalScore).toBe(0.5);
  });

  it('critical missing caps score at 0.3', () => {
    const r = scoreAnswer(
      '只有部分内容',
      [
        { pattern: '63750', type: 'number', severity: 'critical' },
        { pattern: '只有', type: 'string', severity: 'supporting' },
      ],
      [],
    );
    expect(r.criticalMissing).toBe(true);
    expect(r.finalScore).toBeLessThanOrEqual(0.3);
  });

  it('weighted: critical hit doubles weight', () => {
    const r = scoreAnswer(
      '关键 63750',
      [
        { pattern: '63750', type: 'number', severity: 'critical' },
        { pattern: '附属', type: 'string', severity: 'supporting' },
      ],
      [],
    );
    // critical(2) hit, supporting(1) miss → 2/3
    expect(r.mustContainScore).toBeCloseTo(2 / 3);
  });

  it('mustNotContain 1 hit → -0.5 penalty', () => {
    const r = scoreAnswer(
      '炮数 63750 串扰 60300',
      [{ pattern: '63750', type: 'number' }],
      [{ pattern: '60300', type: 'string', reason: '其他井数字' }],
    );
    expect(r.mustNotContainPenalty).toBe(0.5);
    expect(r.finalScore).toBe(0.5);
  });

  it('mustNotContain 2 hits → -1.0 penalty (floored at 0)', () => {
    const r = scoreAnswer(
      '60300 50982',
      [{ pattern: 'X', type: 'string' }],
      [
        { pattern: '60300', type: 'string' },
        { pattern: '50982', type: 'string' },
      ],
    );
    expect(r.mustNotContainPenalty).toBe(1);
    expect(r.finalScore).toBe(0);
  });

  it('empty mustContain → score 1.0 (no constraints)', () => {
    const r = scoreAnswer('任何内容', [], []);
    expect(r.finalScore).toBe(1);
  });
});
describe('unitsCompatible', () => {
  it('炮 ↔ 个 (勘探场景同义)', () => {
    expect(unitsCompatible('炮', '个')).toBe(true);
    expect(unitsCompatible('个', '炮')).toBe(true);
  });
  it('米类同组', () => {
    expect(unitsCompatible('m', 'mm')).toBe(true);
  });
  it('候选空单位放过', () => {
    expect(unitsCompatible('炮', '')).toBe(true);
    expect(unitsCompatible('m', '')).toBe(true);
  });
  it('跨组拒绝', () => {
    expect(unitsCompatible('炮', 'm')).toBe(false);
    expect(unitsCompatible('m', 'km²')).toBe(false);
    expect(unitsCompatible('%', '炮')).toBe(false);
  });
  it('matchesFact: 63750 炮 命中 63750 个', () => {
    expect(
      matchesFact('设计炮数为63750个', {
        pattern: '63750',
        type: 'number',
        unit: '炮',
      }),
    ).toBe(true);
  });
});
