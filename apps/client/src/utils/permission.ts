export function hasPermission(requiredPermission: string): boolean {
  const userStore = useUserStore();
  if (!userStore.userInfo) return false;
  // 如果是管理员，直接返回true
  if (userStore.userInfo.isAdmin) return true;
  const userPermissions = userStore.userInfo.roles
    .flatMap((role) => role.menus ?? [])
    .filter((menu) => menu.type === 'button')
    .map((menu) => menu.permission)
    .filter(Boolean);
  return userPermissions.includes(requiredPermission);
}
