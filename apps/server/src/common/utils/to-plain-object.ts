/**
 * 将 class 实例转换为纯 JavaScript 对象（去除原型链）。
 * 用于将 class-validator 装饰的 DTO 传递给 Prisma 等仅接受 plain object 的场景。
 *
 * @returns 拥有与原实例相同可枚举自有属性的纯对象
 */
export function toPlainObject<T extends object>(
  instance: T,
): { [K in keyof T]: T[K] } {
  return Object.assign({} as { [K in keyof T]: T[K] }, instance);
}
