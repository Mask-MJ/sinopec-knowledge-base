import type { Router } from 'vue-router';

import { storeToRefs } from 'pinia';

import { DEFAULT_HOME_PATH, LOGIN_PATH } from '@/config/constants';
import { DEFAULT_PREFERENCES } from '@/config/preferences';

/** 校验 redirect 路径是否为站内安全路径（防止开放重定向） */
function isSafeRedirect(path: string): boolean {
  try {
    const url = new URL(path, 'http://localhost');
    return url.origin === 'http://localhost';
  } catch {
    return false;
  }
}

/** 缓存进度条偏好（静态值，避免每次导航都读取） */
const showProgress = DEFAULT_PREFERENCES.transition.progress;
/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();
  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && showProgress) {
      window.$loadingBar.start();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载，如果已经加载，后续的页面切换动画等效果不再重复执行
    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (showProgress) {
      window.$loadingBar.finish();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  const userStore = useUserStore();

  router.beforeEach(async (to, from) => {
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

    // 已登录用户不应再访问登录页
    if (to.path === LOGIN_PATH) {
      return { path: DEFAULT_HOME_PATH, replace: true };
    }

    // 明确声明忽略权限的路由（如 403、404），直接放行
    if (to.meta.ignoreAccess) {
      return true;
    }

    // 是否已经初始化权限
    if (isAccessChecked.value) {
      return true;
    }

    // 生成路由表 & 获取用户信息
    try {
      if (!userStore.userInfo) {
        await getUserInfoAction();
      }
      await fetchMenuList(router);
    } catch {
      // 接口异常（网络错误、token 过期等），清除状态并跳转登录页。
      // 同步将 loadingBar 标记为 error 让用户感知失败，否则 afterEach 的
      // finish() 会让加载条静默归位，看不出曾经报错。
      if (showProgress) {
        window.$loadingBar.error();
      }
      userStore.$reset();
      return {
        path: LOGIN_PATH,
        query: { redirect: encodeURIComponent(to.fullPath) },
        replace: true,
      };
    }

    // 用户信息 + 菜单列表已加载成功，初始化完成。提前标记可避免后续
    // 降级 / 403 跳转再次进入"未初始化"分支重复请求 getUserInfo + fetchMenuList。
    setIsAccessChecked(true);

    if (to.path === '/') return { path: DEFAULT_HOME_PATH, replace: true };

    // 没有权限：先尝试降级到侧栏第一个可访问菜单，仍无路可走才跳 403。
    // 场景：管理员刚为用户分配了新角色，但 DEFAULT_HOME_PATH 不在新角色
    // 权限内 — 直接 403 让人摸不着头脑，降级到首个可见菜单更友好。
    if (!userStore.hasAccess(to.path)) {
      const fallback = userStore.getFirstAccessibleMenu();
      if (fallback && fallback !== to.path) {
        return { path: fallback, replace: true };
      }
      return { path: '/403', replace: true };
    }

    // 检查是否有来自登录页的 redirect 参数
    const redirectPath = from.query.redirect as string | undefined;
    if (redirectPath) {
      const decodedPath = decodeURIComponent(redirectPath);
      // 校验 redirect 必须是站内安全路径
      if (isSafeRedirect(decodedPath) && decodedPath !== '/') {
        return { path: decodedPath, replace: true };
      }
      return { path: DEFAULT_HOME_PATH, replace: true };
    }

    // 权限/菜单刚初始化完成，重新发起一次到目标路由的导航，确保侧栏菜单等
    // 依赖权限状态的视图在状态已就绪时挂载（修复首登左侧菜单不渲染、需手动
    // 刷新才出现的问题）。二次导航时 isAccessChecked 已为 true，会在上方提前
    // return true，不会造成死循环。
    return { ...to, replace: true };
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
