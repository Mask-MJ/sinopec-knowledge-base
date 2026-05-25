import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * 递归对对象的 key 按字典序排序，保持数组原顺序。
 *
 * 数组内容不重排（enum values / parameters / required 等语义依赖顺序），
 * 仅对数组元素递归下钻以保证内部 object key 一致性。
 */
function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .sort()
      .map((key) => [key, sortKeysDeep(obj[key])] as const);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/**
 * 对 SwaggerModule.createDocument 输出做确定性稳定化。
 *
 * - 所有 object key 深度字典序排序（paths / components.schemas / properties ...）
 * - 普通数组保持原顺序（enum / parameters / required 等顺序含业务语义）
 * - tags 数组例外：按 name 字典序重排（UI 展示顺序字母化即可）
 *
 * Why: NestJS SwaggerModule 依赖模块扫描、DTO 首次引用、Prisma 客户端生成顺
 * 序决定 paths/schemas 的插入顺序，跨环境/重启不保证一致。稳定化后，前端
 * `pnpm openapi` 产物的 diff 只反映真实 API 变更。
 *
 * Immutable: 不修改入参，返回全新 document 对象。
 */
export function stabilizeDocument(doc: OpenAPIObject): OpenAPIObject {
  const normalized: OpenAPIObject = {
    ...doc,
    ...(doc.tags && {
      tags: [...doc.tags].sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      }),
    }),
  };
  return sortKeysDeep(normalized);
}
