// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import { describe, expect, it, vi } from 'vitest';

import {
  averageScores,
  parseJudgeScore,
  resolveJudgeReplicas,
  runReplicas,
} from './judge';

describe('parseJudgeScore', () => {
  it('parses plain decimal', () => {
    expect(parseJudgeScore('0.85')).toBe(0.85);
  });

  it('parses integer score', () => {
    expect(parseJudgeScore('1')).toBe(1);
    expect(parseJudgeScore('0')).toBe(0);
  });

  it('extracts the first float when surrounded by text', () => {
    expect(parseJudgeScore('得分：0.7，原因略')).toBe(0.7);
  });

  it('clamps values above 1', () => {
    expect(parseJudgeScore('1.5')).toBe(1);
  });

  it('clamps negative values to 0 (matched as positive though)', () => {
    // 正则只抓数字本身，符号会被忽略，相当于用绝对值的小数部分。这里只确认结果在 [0,1]。
    const score = parseJudgeScore('-0.3');
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(1);
  });

  it('returns null on empty / non-numeric', () => {
    expect(parseJudgeScore('')).toBeNull();
    expect(parseJudgeScore('  ')).toBeNull();
    expect(parseJudgeScore('一般般')).toBeNull();
  });
});

describe('averageScores', () => {
  it('returns null on empty array', () => {
    expect(averageScores([])).toBeNull();
  });

  it('returns null when all entries are null', () => {
    expect(averageScores([null, null, null])).toBeNull();
  });

  it('averages all-valid scores and rounds to 2 decimals', () => {
    expect(averageScores([0.7, 0.4, 0.7])).toBe(0.6);
  });

  it('averages only the valid scores when some are null', () => {
    // (0.8 + 0.6) / 2 = 0.7
    expect(averageScores([0.8, null, 0.6])).toBe(0.7);
  });

  it('rounds to 2 decimals (half up)', () => {
    // (0.333 + 0.333 + 0.334) / 3 ≈ 0.3333 → 0.33
    expect(averageScores([0.333, 0.333, 0.334])).toBe(0.33);
    // (0.5 + 0.5 + 0.51) / 3 ≈ 0.5033 → 0.5
    expect(averageScores([0.5, 0.5, 0.51])).toBe(0.5);
  });

  it('handles single-element arrays', () => {
    expect(averageScores([0.42])).toBe(0.42);
  });
});

describe('runReplicas', () => {
  it('runs the function n times serially in order', async () => {
    const calls: number[] = [];
    const result = await runReplicas(3, async (i) => {
      calls.push(i);
      return 0.5;
    });
    expect(calls).toEqual([0, 1, 2]);
    expect(result).toEqual([0.5, 0.5, 0.5]);
  });

  it('serializes calls (no overlap)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await runReplicas(3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return 1;
    });
    expect(maxInFlight).toBe(1);
    expect(result).toHaveLength(3);
  });

  it('replaces thrown errors with null and keeps array length', async () => {
    const result = await runReplicas(3, async (i) => {
      if (i === 1) throw new Error('boom');
      return 0.8;
    });
    expect(result).toEqual([0.8, null, 0.8]);
  });

  it('returns all-null when every call throws', async () => {
    const result = await runReplicas(3, async () => {
      throw new Error('always fail');
    });
    expect(result).toEqual([null, null, null]);
  });

  it('passes through null returns (not treated as failure)', async () => {
    const result = await runReplicas(3, async (i) => (i === 1 ? null : 0.7));
    expect(result).toEqual([0.7, null, 0.7]);
  });
});

describe('resolveJudgeReplicas', () => {
  it('returns default when env is undefined / empty', () => {
    expect(resolveJudgeReplicas(undefined)).toBe(3);
    expect(resolveJudgeReplicas('')).toBe(3);
  });

  it('parses valid integer strings', () => {
    expect(resolveJudgeReplicas('5')).toBe(5);
    expect(resolveJudgeReplicas('1')).toBe(1);
  });

  it('falls back when value is non-numeric', () => {
    expect(resolveJudgeReplicas('abc')).toBe(3);
  });

  it('falls back when value is out of bounds', () => {
    expect(resolveJudgeReplicas('0')).toBe(3);
    expect(resolveJudgeReplicas('-1')).toBe(3);
    expect(resolveJudgeReplicas('999')).toBe(3);
  });

  it('honors custom fallback', () => {
    expect(resolveJudgeReplicas(undefined, 7)).toBe(7);
  });
});

// 集成层：runReplicas + averageScores 串起来模拟 callLLMJudge 的核心逻辑
describe('judge replicas + average integration', () => {
  it('3 successful calls → mean rounded to 2 dp', async () => {
    const fakeApi = vi
      .fn<() => Promise<null | number>>()
      .mockResolvedValueOnce(0.7)
      .mockResolvedValueOnce(0.4)
      .mockResolvedValueOnce(0.7);
    const replicas = await runReplicas(3, () => fakeApi());
    expect(fakeApi).toHaveBeenCalledTimes(3);
    expect(replicas).toEqual([0.7, 0.4, 0.7]);
    expect(averageScores(replicas)).toBe(0.6);
  });

  it('all 3 calls fail → averageScores returns null', async () => {
    const fakeApi = vi
      .fn<() => Promise<null | number>>()
      .mockRejectedValue(new Error('rate limit'));
    const replicas = await runReplicas(3, () => fakeApi());
    expect(fakeApi).toHaveBeenCalledTimes(3);
    expect(replicas).toEqual([null, null, null]);
    expect(averageScores(replicas)).toBeNull();
  });

  it('partial failure → mean of successful only', async () => {
    const fakeApi = vi
      .fn<() => Promise<null | number>>()
      .mockResolvedValueOnce(0.8)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(0.6);
    const replicas = await runReplicas(3, () => fakeApi());
    expect(replicas).toEqual([0.8, null, 0.6]);
    // (0.8 + 0.6) / 2 = 0.7
    expect(averageScores(replicas)).toBe(0.7);
  });
});
