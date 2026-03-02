<script lang="ts" setup>
import type { MenuInfo } from '@/api/system/menu';

import { NBreadcrumbItem } from 'naive-ui';

const route = useRoute();
const userStore = useUserStore();
const preferencesStore = usePreferencesStore();
const breadcrumbConfig = computed(() => preferencesStore.state.breadcrumb);
const breadcrumbs = computed(() => {
  const matched = userStore.accessMenus.filter((menu: MenuInfo) => {
    return !menu.hideInBreadcrumb && menu.path;
  });
  const resultBreadcrumb: MenuInfo[] = [];

  function isPathMatch(pattern: string, path: string): boolean {
    if (!pattern || !path) return false;
    if (pattern === path) return true;

    const patternSegments = pattern.split('/').filter(Boolean);
    const pathSegments = path.split('/').filter(Boolean);

    if (patternSegments.length !== pathSegments.length) return false;

    return patternSegments.every((seg, i) => {
      // Support :param and [param]
      if (seg.startsWith(':') || (seg.startsWith('[') && seg.endsWith(']')))
        return true;
      return seg === pathSegments[i];
    });
  }

  function getBreadcrumbPath(path: string, routes: MenuInfo[]): MenuInfo[] {
    // 获取完整的面包屑路径
    const currentMenu = routes.find((menu) => isPathMatch(menu.path, path));
    if (!currentMenu) {
      return [];
    }

    // 如果是根菜单（没有父级），直接返回当前菜单
    if (currentMenu.parentId === null) {
      return [currentMenu];
    }

    // 查找父级菜单
    const parentMenu = routes.find((menu) => menu.id === currentMenu.parentId);
    if (!parentMenu) {
      return [currentMenu];
    }

    // 递归获取父级路径，然后将当前菜单添加到末尾
    const parentPath = getBreadcrumbPath(parentMenu.path, routes);
    return [...parentPath, currentMenu];
  }

  // 获取当前路由的完整面包屑路径
  const menuPath = getBreadcrumbPath(route.path, matched);

  resultBreadcrumb.push(...menuPath);

  if (breadcrumbConfig.value.hideOnlyOne && resultBreadcrumb.length === 1) {
    return [];
  }

  return resultBreadcrumb;
});
</script>
<template>
  <NBreadcrumb class="ml-2">
    <NBreadcrumbItem v-for="breadcrumb in breadcrumbs" :key="breadcrumb.path">
      <NIcon>
        <i class="inline-block" :class="breadcrumb.icon"></i>
      </NIcon>
      {{ $t(`page.${breadcrumb.title}`) }}
    </NBreadcrumbItem>
  </NBreadcrumb>
</template>
