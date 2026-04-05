import { isEqual } from 'lodash-es';

type DiffResult<T> = Partial<{
  [K in keyof T]: T[K] extends object ? DiffResult<T[K]> : T[K];
}>;

export function diff<T extends Record<string, unknown>>(
  obj1: T,
  obj2: T,
): DiffResult<T> {
  function findDifferences(o1: unknown, o2: unknown): unknown {
    if (Array.isArray(o1) && Array.isArray(o2)) {
      return isEqual(o1, o2) ? undefined : o2;
    }

    if (
      typeof o1 === 'object' &&
      typeof o2 === 'object' &&
      o1 !== null &&
      o2 !== null
    ) {
      const rec1 = o1 as Record<string, unknown>;
      const rec2 = o2 as Record<string, unknown>;
      const diffResult: Record<string, unknown> = {};

      const keys = new Set([...Object.keys(rec1), ...Object.keys(rec2)]);
      for (const key of keys) {
        const valueDiff = findDifferences(rec1[key], rec2[key]);
        if (valueDiff !== undefined) {
          diffResult[key] = valueDiff;
        }
      }

      return Object.keys(diffResult).length > 0 ? diffResult : undefined;
    }

    return o1 === o2 ? undefined : o2;
  }

  return findDifferences(obj1, obj2) as DiffResult<T>;
}
