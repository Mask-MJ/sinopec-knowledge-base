import type { ProTagsConfig } from 'pro-naive-ui';

/**
 * 状态 → n-tag `type` 颜色的映射字典。
 *
 * 键是业务状态码（如 'PAID' / 'FAILED'），值是 naive-ui `<n-tag>` 的
 * `type` 取值。类型来自 `pro-naive-ui` 的 `ProTagsConfig['type']`，和
 * `renderProTags` 保持同源。
 */
export type TagColorMap = Record<string, ProTagsConfig['type']>;

/**
 * 把 `TagColorMap` 包装成一个带兜底的 getter：
 * `getXxxType('UNPAID') → 'warning'`；查不到返回 `fallback`（默认 `'default'`）。
 *
 * 用于替换散落在各 composable 里"一模一样的三行 getter 函数体"。
 */
export function createTagTypeGetter<K extends string>(
  map: Record<K, ProTagsConfig['type']>,
  fallback: ProTagsConfig['type'] = 'default',
): (key: (string & {}) | K) => ProTagsConfig['type'] {
  return (key) => map[key as K] ?? fallback;
}

/**
 * 启停二值状态 → tag `type` 颜色：active=success / inactive=error。
 *
 * 用于 5 处 system/monitor 列表"启用 / 禁用"列同模板渲染，避免每个调
 * 用点重复写 `rowData.status ? 'success' : 'error'`。
 */
export function activeStatusTag(active: boolean): ProTagsConfig['type'] {
  return active ? 'success' : 'error';
}
