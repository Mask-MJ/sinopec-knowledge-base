import type { MaybeRefOrGetter } from 'vue';

import { hasPermission } from '@/utils/permission';

/**
 * 权限判断 composable
 *
 * 用法：
 *   const canEdit = usePermission('system:user:update')
 *   const canOperate = usePermission(['system:user:update', 'system:user:delete'])
 *   const canAll = usePermission(['system:user:update', 'system:user:delete'], 'every')
 */
export function usePermission(
  code: MaybeRefOrGetter<string | string[]>,
  mode: 'every' | 'some' = 'some',
): ComputedRef<boolean> {
  return computed(() => {
    const value = toValue(code);
    const codes = Array.isArray(value) ? value : [value];
    if (codes.length === 0) return true;
    return mode === 'every'
      ? codes.every((c) => hasPermission(c))
      : codes.some((c) => hasPermission(c));
  });
}
