import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createKeywordMatcher,
  inferProjectKeywords,
  matchChunk,
  parseDict,
  parseRegexCatalog,
} from './keyword-matcher';

describe('parseDict', () => {
  it('parses term,tags csv, skips header, splits multi-tags by ;', () => {
    const dict = parseDict('term,tags\nAGC,数据处理\n微测井,表层调查;静校正\n');
    expect(dict.get('AGC')).toEqual(['数据处理']);
    expect(dict.get('微测井')).toEqual(['表层调查', '静校正']);
    expect(dict.size).toBe(2);
  });

  it('skips blank and tag-less lines', () => {
    const dict = parseDict('term,tags\n\nfoo\nbar,t1');
    expect(dict.has('foo')).toBe(false);
    expect(dict.get('bar')).toEqual(['t1']);
  });
});

describe('parseRegexCatalog', () => {
  it('compiles patterns with global flag and keeps tags', () => {
    const regexes = parseRegexCatalog(
      JSON.stringify([
        { name: 'n', pattern: String.raw`\d+m`, tags: ['尺寸'] },
      ]),
    );
    const r = regexes[0];
    if (!r) throw new Error('expected at least one compiled regex');
    expect(r.re.flags).toContain('g');
    expect(r.tags).toEqual(['尺寸']);
    expect('埋深3m'.match(r.re)).toEqual(['3m']);
  });
});

describe('matchChunk', () => {
  const dict = parseDict('term,tags\n微测井,表层调查\n');
  const regexes = parseRegexCatalog(
    JSON.stringify([{ name: 'n', pattern: String.raw`\d+m`, tags: ['尺寸'] }]),
  );

  it('collects dict term + tag + regex match text + regex tag', () => {
    const out = matchChunk('用微测井,埋深4m', dict, regexes, 30);
    expect(out).toContain('微测井');
    expect(out).toContain('表层调查');
    expect(out).toContain('4m');
    expect(out).toContain('尺寸');
  });

  it('dedupes and caps at maxKeywords, keywords before tags', () => {
    const out = matchChunk('微测井微测井 4m 5m', dict, regexes, 2);
    expect(out).toEqual(['微测井', '4m']);
  });

  it('returns empty when nothing matches', () => {
    expect(matchChunk('xyz', dict, regexes, 30)).toEqual([]);
  });
});

describe('inferProjectKeywords', () => {
  it('maps 顺8井北 docName to project keywords', () => {
    expect(inferProjectKeywords('2016年顺8井北三维.docx')).toEqual([
      '顺8井北',
      '顺8井北三维',
    ]);
  });

  it('matches 顺中二期 before the bare 顺中 rule', () => {
    expect(inferProjectKeywords('顺中二期三维.docx')).toEqual([
      '顺中二期',
      '顺中2期',
    ]);
  });

  it('maps bare 顺中 (not 二期) to the 顺中 rule', () => {
    expect(inferProjectKeywords('顺中一期处理.docx')).toContain('顺中');
  });

  it('returns [] for unknown project', () => {
    expect(inferProjectKeywords('未知项目.docx')).toEqual([]);
  });
});

describe('createKeywordMatcher (smoke, real dataset files)', () => {
  it('loads real dataset and returns an array', () => {
    const matcher = createKeywordMatcher(
      // eslint-disable-next-line unicorn/prefer-module
      join(__dirname, 'dataset', 'sinopec-concept-dict.csv'),
      // eslint-disable-next-line unicorn/prefer-module
      join(__dirname, 'dataset', 'sinopec-regex-catalog.json'),
      30,
    );
    expect(matcher.match('AGC').length).toBeGreaterThan(0);
  });
});
