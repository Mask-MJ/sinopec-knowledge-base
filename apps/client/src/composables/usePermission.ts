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

/**
 * 权限判断工具 composable — 提供模板友好的 can/canAll 函数
 *
 * 推荐用于替代 v-permission 指令，配合 v-if 使用：
 *   const { can, canAll } = useCan()
 *   <n-button v-if="can('system:user:update')">编辑</n-button>
 *   <n-button v-if="canAll('system:user:update', 'system:user:delete')">操作</n-button>
 */
export function useCan() {
  return {
    can: (permission: string) => hasPermission(permission),
    canAny: (...permissions: string[]) =>
      permissions.some((p) => hasPermission(p)),
    canAll: (...permissions: string[]) =>
      permissions.every((p) => hasPermission(p)),
  };
}
