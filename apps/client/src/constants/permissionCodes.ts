/**
 * 权限码常量
 * 集中管理所有前端使用的权限标识，避免硬编码字符串散落各处
 *
 * 注意：这些权限码需要在后端菜单管理中同步注册，否则 hasPermission() 无法匹配
 */
export const PERMISSION = {} as const;
