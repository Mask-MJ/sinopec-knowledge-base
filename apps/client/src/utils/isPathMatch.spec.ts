import { describe, expect, it } from 'vitest';

import { isPathMatch } from './isPathMatch';

describe('isPathMatch', () => {
  it('returns false for empty inputs', () => {
    expect(isPathMatch('', '/foo')).toBe(false);
    expect(isPathMatch('/foo', '')).toBe(false);
    expect(isPathMatch('', '')).toBe(false);
  });

  it('matches identical paths', () => {
    expect(isPathMatch('/foo/bar', '/foo/bar')).toBe(true);
  });

  it('returns false when segment counts differ', () => {
    expect(isPathMatch('/user/:id', '/user/42/edit')).toBe(false);
    expect(isPathMatch('/user/:id/edit', '/user/42')).toBe(false);
  });

  it('matches :param dynamic segments', () => {
    expect(isPathMatch('/user/:id', '/user/42')).toBe(true);
    expect(isPathMatch('/post/:id/comment/:cid', '/post/1/comment/2')).toBe(
      true,
    );
  });

  it('matches [param] dynamic segments (Nuxt-style)', () => {
    expect(isPathMatch('/user/[id]', '/user/42')).toBe(true);
  });

  it('does not match different static segments', () => {
    expect(isPathMatch('/user/:id', '/other/42')).toBe(false);
    expect(isPathMatch('/foo/bar', '/foo/baz')).toBe(false);
  });

  it('strips empty segments from leading/trailing slashes', () => {
    expect(isPathMatch('/foo/bar/', '/foo/bar')).toBe(true);
    expect(isPathMatch('foo/bar', '/foo/bar/')).toBe(true);
  });

  it('mixes static and dynamic segments', () => {
    expect(isPathMatch('/api/v1/user/:id/posts', '/api/v1/user/42/posts')).toBe(
      true,
    );
    expect(isPathMatch('/api/v1/user/:id/posts', '/api/v2/user/42/posts')).toBe(
      false,
    );
  });
});
