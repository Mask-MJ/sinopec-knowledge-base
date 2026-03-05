import type { App } from 'vue';

import { setupLayouts } from 'virtual:generated-layouts';
import { createRouter, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';

import { unmountGlobalLoading } from '@/utils';

import { createRouterGuard } from './permissionGuard';

export const router = createRouter({
  history: createWebHistory(),
  routes: setupLayouts(routes),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  strict: true,
});

export function initRouter(app: App) {
  app.use(router);
  createRouterGuard(router);

  // 路由准备就绪后，移除并销毁首屏 loading
  void router.isReady().then(() => {
    unmountGlobalLoading();
  });
}
