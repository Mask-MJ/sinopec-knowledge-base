import { describe, expect, it } from 'vitest';

import { createLatestRequestGuard } from './latest-request-guard';

describe('latest-request-guard', () => {
  it('next() returns monotonically increasing id', () => {
    const guard = createLatestRequestGuard();
    const id1 = guard.next();
    const id2 = guard.next();
    expect(id2).toBeGreaterThan(id1);
  });

  it('isLatest() is true for the most recent next() id', () => {
    const guard = createLatestRequestGuard();
    const id = guard.next();
    expect(guard.isLatest(id)).toBe(true);
  });

  it('isLatest() is false for stale ids after another next()', () => {
    const guard = createLatestRequestGuard();
    const stale = guard.next();
    guard.next();
    expect(guard.isLatest(stale)).toBe(false);
  });

  it('invalidate() invalidates all in-flight ids without issuing a new one', () => {
    const guard = createLatestRequestGuard();
    const id = guard.next();
    guard.invalidate();
    expect(guard.isLatest(id)).toBe(false);
  });

  it('current() returns the latest id without advancing', () => {
    const guard = createLatestRequestGuard();
    guard.next();
    const before = guard.current();
    expect(guard.current()).toBe(before);
    // current() does not invalidate the prior id
    expect(guard.isLatest(before)).toBe(true);
  });
});
