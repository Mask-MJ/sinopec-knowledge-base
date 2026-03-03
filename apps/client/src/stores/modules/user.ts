import type { MenuInfo } from '@/api/system/menu';
import type { SignInEntity, SignInParams, UserInfo } from '@/api/system/user';
import type { RemovableRef } from '@vueuse/core';
import type { RouteMeta, Router } from 'vue-router';

import { acceptHMRUpdate, defineStore } from 'pinia';

import { getMenuList } from '@/api/system/menu';
import {
  getAccessCodes as getAccessCodesApi,
  getUserInfo as getUserInfoApi,
  login as loginApi,
  refreshToken as refreshTokenApi,
} from '@/api/system/user';
import { DEFAULT_HOME_PATH } from '@/config/constants';
import { router } from '@/router';

export const useUserStore = defineStore('user-store', () => {
  // 权限码
  const accessCodes = ref<string[]>([]);
  // 可访问的菜单列表
  const accessMenus = ref<MenuInfo[]>([]);
  const token: RemovableRef<SignInEntity> = useStorage('TOKEN', {
    accessToken: '',
    refreshToken: '',
  });
  // 登录中
  const loginLoading = ref<boolean>(false);
  // 是否已经检查过权限
  const isAccessChecked = ref<boolean>(false);
  // 用户信息
  const userInfo = ref<null | UserInfo>(null);
  // 用户角色
  const userRoles = ref<string[]>([]);

  const setAccessCodes = (codes: string[]) => {
    accessCodes.value = codes;
  };

  const setAccessMenus = (menus: MenuInfo[] = []) => {
    accessMenus.value = menus;
  };

  const setToken = (newToken: SignInEntity) => {
    token.value = newToken;
  };

  const setIsAccessChecked = (checked: boolean) => {
    isAccessChecked.value = checked;
  };

  const setUserInfo = (info: UserInfo) => {
    userInfo.value = info;
  };

  const setUserRoles = (roles: string[]) => {
    userRoles.value = roles;
  };

  const hasAccess = (path: string) => {
    // 判断 path 最后是否以 '/' 加数字结尾，如果是，则把 / 和数字替换为 /:id
    path = path.replace(/\/\d+$/, '/:id');
    // 如果是根路径，直接返回 true
    if (path === '/') return true;
    return accessMenus.value.some((menu: MenuInfo) => menu.path === path);
  };

  const getUserInfoAction = async () => {
    const { data } = await getUserInfoApi();
    if (data) {
      setUserInfo(data);
    }
    return data || null;
  };

  const login = async (
    params: SignInParams,
    onSuccess?: () => Promise<void> | void,
  ) => {
    try {
      loginLoading.value = true;
      const { data } = await loginApi(params);
      if (data && data.accessToken) {
        setToken(data);

        const { data: accessCodesData = [] } = await getAccessCodesApi();

        setAccessCodes(accessCodesData);
        await (onSuccess ? onSuccess() : router.push(DEFAULT_HOME_PATH));
        return getUserInfoAction();
      }
      return null;
    } finally {
      loginLoading.value = false;
    }
  };

  const refreshToken = async () => {
    const { data } = await refreshTokenApi({
      refreshToken: token.value.refreshToken,
    });
    if (data && data.accessToken) {
      setToken(data);
    }
    return data || null;
  };

  const logout = () => {
    resetState();
    void router.push('/login');
  };

  const fetchMenuList = async (router: Router) => {
    const { data = [] } = await getMenuList();
    const menus = data.filter(
      (menu: MenuInfo) => menu.status && menu.type !== 'button',
    );
    menus.forEach((menu: MenuInfo) => {
      const { path, redirect, ...rest } = menu;
      // 更新原始路由数据
      router.getRoutes().forEach((item) => {
        if (item.path === path) {
          item.redirect = redirect || item.redirect;
          item.meta = { ...item.meta, ...(rest as unknown as RouteMeta) };
        }
      });
    });
    setAccessMenus(menus);
    return data || [];
  };

  const getMenuByPath = (path: string) => {
    const findMenu = (
      menus: MenuInfo[],
      path: string,
    ): MenuInfo | undefined => {
      for (const menu of menus) {
        if (menu.path === path) {
          return menu;
        }
        if (menu.children) {
          const matched = findMenu(menu.children, path);
          if (matched) {
            return matched;
          }
        }
      }
    };
    return findMenu(accessMenus.value, path);
  };

  const resetState = () => {
    accessCodes.value = [];
    accessMenus.value = [];
    token.value = { accessToken: '', refreshToken: '' };
    isAccessChecked.value = false;
    userInfo.value = null;
    userRoles.value = [];
  };

  return {
    accessCodes,
    accessMenus,
    token,
    loginLoading,
    isAccessChecked,
    userInfo,
    userRoles,

    $reset: resetState,
    hasAccess,
    login,
    refreshToken,
    fetchMenuList,
    getMenuByPath,
    setAccessCodes,
    setAccessMenus,
    setToken,
    setIsAccessChecked,
    setUserInfo,
    getUserInfoAction,
    setUserRoles,
    logout,
  };
});

// 解决热更新问题
const hot = import.meta.hot;
if (hot) {
  hot.accept(acceptHMRUpdate(useUserStore, hot));
}
