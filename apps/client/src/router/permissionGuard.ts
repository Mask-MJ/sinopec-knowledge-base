import type { Router } from 'vue-router';

import { storeToRefs } from 'pinia';

import { DEFAULT_HOME_PATH, LOGIN_PATH } from '@/config/constants';
import { DEFAULT_PREFERENCES } from '@/config/preferences';
/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();
  router.beforeEach(async (to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && DEFAULT_PREFERENCES.transition.progress) {
      window.$loadingBar?.start();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行

    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (DEFAULT_PREFERENCES.transition.progress) {
      window.$loadingBar?.finish();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const userStore = useUserStore();
    const { getUserInfoAction, fetchMenuList, setIsAccessChecked } = userStore;
    const { token, isAccessChecked } = storeToRefs(userStore);

    // accessToken 检查
    if (!token.value.accessToken || !token.value.refreshToken) {
      // 明确声明忽略权限访问权限，则可以访问
      if (to.meta.ignoreAccess) {
        return true;
      }
      // 没有访问权限，跳转登录页面
      if (to.path !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          query:
            to.fullPath === DEFAULT_HOME_PATH
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          replace: true,
        };
      }
      return true;
    }

    // 是否已经初始化权限
    if (isAccessChecked.value) {
      return true;
    }
    // 生成路由表
    // 当前登录用户拥有的角色标识列表
    if (!userStore.userInfo) {
      await getUserInfoAction();
    }
    await fetchMenuList(router);
    setIsAccessChecked(true);

    if (to.path === '/') return { path: DEFAULT_HOME_PATH, replace: true };

    // 如果没有访问权限，则跳转到403页面
    if (!userStore.hasAccess(to.path)) {
      return { path: '/403', replace: true };
    }

    const redirectPath = (from.query.redirect ??
      (to.path === DEFAULT_HOME_PATH
        ? DEFAULT_HOME_PATH
        : to.fullPath)) as string;

    if (decodeURIComponent(decodeURIComponent(redirectPath)) === '/') {
      return { path: DEFAULT_HOME_PATH, replace: true };
    }
    return {
      ...router.resolve(decodeURIComponent(redirectPath)),
      replace: true,
    };
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };
