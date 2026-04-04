import type { Directive } from 'vue';

import { hasPermission } from '@/utils/permission';

/**
 * v-permission 指令
 *
 * 用法：
 *   <n-button v-permission="'system:user:update'">编辑</n-button>
 *   <n-button v-permission="PERMISSION.SYSTEM.USER.UPDATE">编辑</n-button>
 *   <n-button v-permission="['system:user:update', 'system:user:delete']">操作</n-button>
 */
export const vPermission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const codes = Array.isArray(binding.value)
      ? binding.value
      : [binding.value];

    if (codes.length === 0) return;

    const hasAuth = codes.some((code) => hasPermission(code));
    if (!hasAuth) {
      el.remove();
    }
  },
  updated(el, binding) {
    if (binding.value === binding.oldValue) return;

    const codes = Array.isArray(binding.value)
      ? binding.value
      : [binding.value];

    if (codes.length === 0) return;

    const hasAuth = codes.some((code) => hasPermission(code));
    if (!hasAuth) {
      el.remove();
    }
  },
};
