// cspell:disable-file
import { describe, expect, it } from 'vitest';

import { parseIdList } from './retrieval-replay.lib';

describe('parseIdList', () => {
  it('parses a csv of ids', () => {
    expect(parseIdList('6,14,18')).toEqual([6, 14, 18]);
  });
  it('trims spaces and drops empties', () => {
    expect(parseIdList(' 4, 8 ,,19 ')).toEqual([4, 8, 19]);
  });
  it('drops non-integer tokens', () => {
    expect(parseIdList('1,foo,3')).toEqual([1, 3]);
  });
  it('returns [] for empty string', () => {
    expect(parseIdList('')).toEqual([]);
  });
});
