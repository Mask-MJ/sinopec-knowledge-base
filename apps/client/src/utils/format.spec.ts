import { describe, expect, it } from 'vitest';

import {
  fmtBool,
  fmtCompact,
  fmtCurrency,
  fmtDecimal2,
  fmtList,
  fmtNumber,
  fmtPercent,
  fmtRatio,
  fmtSharePercent,
  fmtText,
} from './format';

describe('fmtNumber', () => {
  it('returns dash for NaN', () => {
    expect(fmtNumber(undefined)).toBe('-');
    expect(fmtNumber('abc')).toBe('-');
  });
  it('adds thousand separators', () => {
    expect(fmtNumber(1_234_567)).toBe('1,234,567');
  });
});

describe('fmtRatio', () => {
  it('keeps two decimal places', () => {
    expect(fmtRatio(1.5)).toBe('1.50');
    expect(fmtRatio(1234.567)).toBe('1,234.57');
  });
});

describe('fmtPercent', () => {
  it('appends % with 2 decimals', () => {
    expect(fmtPercent(12.345)).toBe('12.35%');
  });
});

describe('fmtSharePercent', () => {
  it('returns 0% for non-positive / NaN input', () => {
    expect(fmtSharePercent(null)).toBe('0%');
    expect(fmtSharePercent(undefined)).toBe('0%');
    expect(fmtSharePercent(0)).toBe('0%');
    expect(fmtSharePercent(-1)).toBe('0%');
    expect(fmtSharePercent(Number.NaN)).toBe('0%');
  });

  it('formats normal share at 1-decimal precision (d=1 hits)', () => {
    expect(fmtSharePercent(0.0365)).toBe('3.6%');
  });

  it('upgrades precision when 1-decimal rounds to 0 (d=4 hits)', () => {
    expect(fmtSharePercent(0.000_001)).toBe('0.0001%');
  });

  it('falls back to "< 0.0001%" sentinel when even maxDecimals rounds to 0', () => {
    expect(fmtSharePercent(1e-10)).toBe('< 0.0001%');
  });

  it('does not crash with maxDecimals = 0 (clamped to 1)', () => {
    expect(() => fmtSharePercent(0.1, 0)).not.toThrow();
    expect(fmtSharePercent(0.1, 0)).toBe('10.0%');
  });

  it('does not crash with negative maxDecimals (also clamped)', () => {
    expect(() => fmtSharePercent(0.1, -3)).not.toThrow();
  });

  it('honors custom maxDecimals (e.g. 2)', () => {
    expect(fmtSharePercent(0.000_001, 2)).toBe('< 0.01%');
  });
});

describe('fmtDecimal2', () => {
  it('formats with configurable digits', () => {
    expect(fmtDecimal2(1234.567)).toBe('1,234.57');
    expect(fmtDecimal2(1234.5, 3)).toBe('1,234.500');
  });
  it('returns dash for invalid', () => {
    expect(fmtDecimal2(undefined)).toBe('-');
  });
});

describe('fmtCompact', () => {
  it('returns dash for NaN input', () => {
    expect(fmtCompact(undefined)).toBe('-');
    expect(fmtCompact('not-a-number')).toBe('-');
    expect(fmtCompact(Number.NaN)).toBe('-');
  });

  it('formats K range (>=1e3)', () => {
    expect(fmtCompact(1234)).toBe('1.23K');
  });

  it('formats M range (>=1e6)', () => {
    expect(fmtCompact(1_234_567)).toBe('1.23M');
  });

  it('formats B range (>=1e9)', () => {
    expect(fmtCompact(1.5e9)).toBe('1.5B');
  });

  it('formats T range (>=1e12)', () => {
    expect(fmtCompact(1.5e12)).toBe('1.5T');
  });

  it('honors digits parameter', () => {
    expect(fmtCompact(1234, 0)).toBe('1K');
    expect(fmtCompact(1234, 1)).toBe('1.2K');
  });

  it('handles small numbers (no compaction)', () => {
    expect(fmtCompact(42)).toBe('42');
  });
});

describe('fmtCurrency', () => {
  it('returns dash for invalid input', () => {
    expect(fmtCurrency('abc')).toBe('-');
    expect(fmtCurrency(undefined)).toBe('-');
  });
  it('formats USD by default', () => {
    expect(fmtCurrency(1234.5)).toContain('1,234.50');
  });
  it('honors explicit currency', () => {
    // GBP uses £ on most ICU builds; assert digits only to keep test stable
    expect(fmtCurrency(1234.5, 'GBP')).toContain('1,234.50');
  });
});

describe('fmtText / fmtList / fmtBool', () => {
  it('fmtText returns dash for empty / null', () => {
    expect(fmtText(null)).toBe('-');
    expect(fmtText('')).toBe('-');
    expect(fmtText('hello')).toBe('hello');
  });
  it('fmtList joins arrays with comma', () => {
    expect(fmtList(['a', 'b'])).toBe('a, b');
    expect(fmtList([])).toBe('-');
    expect(fmtList(null)).toBe('-');
  });
  it('fmtBool maps to check / cross', () => {
    expect(fmtBool(true)).toBe('✓');
    expect(fmtBool(false)).toBe('✗');
    expect(fmtBool(null)).toBe('-');
  });
});
