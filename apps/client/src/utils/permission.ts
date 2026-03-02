export function hasPermission(requiredPermission: string): boolean {
  const userStore = useUserStore();
  if (!userStore.userInfo) return false;
  // 如果是管理员，直接返回true
  if (userStore.userInfo.isAdmin) return true;
  const userPermissions = userStore.userInfo.roles
    .flatMap((role: { menus?: { permission?: string }[] }) => role.menus ?? [])
    .map((menu: { permission?: string }) => menu?.permission)
    .filter(
      (permission: string | undefined): permission is string =>
        permission !== null && permission !== undefined,
    );
  return userPermissions.includes(requiredPermission);
}
