<script lang="ts" setup>
/**
 * Permission 权限控制高阶组件
 *
 * 用法：
 *   <!-- 单权限 -->
 *   <Permission code="business:product:add">
 *     <n-button>新增商品</n-button>
 *   </Permission>
 *
 *   <!-- 多权限（满足其一即可） -->
 *   <Permission :code="['business:product:add', 'business:product:edit']">
 *     <n-button>操作</n-button>
 *   </Permission>
 *
 *   <!-- 多权限（全部满足） -->
 *   <Permission :code="['business:product:add', 'business:product:edit']" mode="every">
 *     <n-button>批量操作</n-button>
 *   </Permission>
 *
 *   <!-- 无权限时显示替代内容 -->
 *   <Permission code="business:product:delete">
 *     <n-button type="error">删除</n-button>
 *     <template #fallback>
 *       <n-tooltip>
 *         <template #trigger>
 *           <n-button disabled>删除</n-button>
 *         </template>
 *         暂无权限
 *       </n-tooltip>
 *     </template>
 *   </Permission>
 */

import { hasPermission } from '@/utils/permission';

interface Props {
  /** 权限码，支持单个字符串或数组 */
  code: string | string[];
  /** 多权限判断模式：some(满足任一) / every(全部满足)，默认 some */
  mode?: 'every' | 'some';
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'some',
});

/** 是否拥有权限 */
const hasAuth = computed(() => {
  const codes = Array.isArray(props.code) ? props.code : [props.code];
  if (codes.length === 0) return true;
  return props.mode === 'every'
    ? codes.every((c) => hasPermission(c))
    : codes.some((c) => hasPermission(c));
});
</script>

<template>
  <template v-if="hasAuth">
    <slot></slot>
  </template>
  <template v-else>
    <slot name="fallback"></slot>
  </template>
</template>
