import { describe, expect, it } from 'vitest';

import { loadRegistry } from './anchor-registry';

describe('loadRegistry', () => {
  it('parses a valid registry array', () => {
    const raw = [
      {
        projectName: '顺北43',
        aliases: ['顺北43井区'],
        wellNumbers: ['顺北43'],
      },
    ];
    const result = loadRegistry(raw);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('顺北43');
  });

  it('accepts empty aliases / wellNumbers arrays', () => {
    const raw = [{ projectName: '张集东', aliases: [], wellNumbers: [] }];
    expect(loadRegistry(raw)).toHaveLength(1);
  });

  it('throws fail-fast on empty projectName with field path', () => {
    const raw = [{ projectName: '', aliases: [], wellNumbers: [] }];
    expect(() => loadRegistry(raw)).toThrow(/\[0\]\.projectName/);
  });

  it('throws when top-level is not an array', () => {
    expect(() => loadRegistry({})).toThrow(/must be an array/);
  });
});
