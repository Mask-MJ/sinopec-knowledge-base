import { describe, expect, it } from 'vitest';

import {
  getLocalDayStamp,
  getMillisecondsUntilNextMidnight,
  isLeaderLeaseActive,
  isLeaderLeaseOwner,
} from './version-check';

describe('getLocalDayStamp', () => {
  it('formats as YYYY-MM-DD with zero-padding', () => {
    expect(getLocalDayStamp(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(getLocalDayStamp(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('getMillisecondsUntilNextMidnight', () => {
  it('returns positive ms to next local midnight', () => {
    const noon = new Date(2026, 5, 15, 12, 0, 0, 0);
    const ms = getMillisecondsUntilNextMidnight(noon);
    expect(ms).toBe(12 * 60 * 60 * 1000);
  });

  it('clamps to 0 when called past the day boundary (defensive)', () => {
    const farFuture = new Date(2026, 5, 15, 23, 59, 59, 999);
    expect(getMillisecondsUntilNextMidnight(farFuture)).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe('isLeaderLeaseActive', () => {
  it('returns false for null lease', () => {
    expect(isLeaderLeaseActive(null, 100)).toBe(false);
  });
  it('returns true while lease is in the future', () => {
    expect(isLeaderLeaseActive({ expiresAt: 200, ownerId: 'a' }, 100)).toBe(
      true,
    );
  });
  it('returns false when lease has expired', () => {
    expect(isLeaderLeaseActive({ expiresAt: 100, ownerId: 'a' }, 200)).toBe(
      false,
    );
  });
});

describe('isLeaderLeaseOwner', () => {
  it('returns false when lease is null', () => {
    expect(isLeaderLeaseOwner(null, 'a', 100)).toBe(false);
  });
  it('returns false when ownerId differs', () => {
    expect(isLeaderLeaseOwner({ expiresAt: 200, ownerId: 'a' }, 'b', 100)).toBe(
      false,
    );
  });
  it('returns true when own + active', () => {
    expect(isLeaderLeaseOwner({ expiresAt: 200, ownerId: 'a' }, 'a', 100)).toBe(
      true,
    );
  });
  it('returns false when own but expired', () => {
    expect(isLeaderLeaseOwner({ expiresAt: 100, ownerId: 'a' }, 'a', 200)).toBe(
      false,
    );
  });
});
