export function hasPermission(requiredPermission: string): boolean {
  const userStore = useUserStore();
  if (!userStore.userInfo) return false;
  // 如果是管理员，直接返回true
  if (userStore.userInfo.isAdmin) return true;
  const userPermissions = userStore.userInfo.roles
    .flatMap((role: any) => role.menus)
    .map((menu) => menu?.permission)
    .filter((permission) => permission !== null);
  return userPermissions.includes(requiredPermission);
}
