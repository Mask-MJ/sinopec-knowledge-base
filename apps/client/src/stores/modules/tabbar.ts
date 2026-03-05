import type {
  RouteLocationNormalized,
  Router,
  RouteRecordNormalized,
} from 'vue-router';

import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { openRouteInNewWindow } from '@/utils';

type TabDefinition = {
  /**
   * 标签页的key
   */
  key?: string;
} & RouteLocationNormalized;

export const useTabbarStore = defineStore('tabbar-store', () => {
  // 当前打开的标签页列表缓存
  const cachedTabs = ref<Set<string>>(new Set());
  // 需要排除缓存的标签页
  const excludeCachedTabs = ref<Set<string>>(new Set());
  // 拖拽结束的索引
  const dragEndIndex = ref<number>(0);
  // 标签右键菜单列表
  const menuList = ref<string[]>([
    'close',
    'affix',
    'maximize',
    'reload',
    'open-in-new-window',
    'close-left',
    'close-right',
    'close-other',
    'close-all',
  ]);
  // 是否刷新
  const renderRouteView = ref<boolean>(true);
  // 当前打开的标签页列表
  const tabs = ref<TabDefinition[]>([]);
  // 更新时间，用于一些更新场景，使用watch深度监听的话，会损耗性能
  const updateTime = ref<number>(Date.now());
  // 固定标签页列表
  const affixTabs = computed<TabDefinition[]>(() => {
    return tabs.value
      .filter((tab) => isAffixTab(tab))
      .sort((a, b) => {
        const orderA = (a.meta?.affixTabOrder ?? 0) as number;
        const orderB = (b.meta?.affixTabOrder ?? 0) as number;
        return orderA - orderB;
      });
  });
  // 获取缓存的标签页
  const getCachedTabs = computed<string[]>(() => [...cachedTabs.value]);
  // 获取需要排除缓存的标签页
  const getExcludeCachedTabs = computed<string[]>(() => [
    ...excludeCachedTabs.value,
  ]);
  // 获取菜单列表
  const getMenuList = computed<string[]>(() => menuList.value);
  // 获取所有标签页，包括固定标签页和非固定标签页
  const getTabs = computed<TabDefinition[]>(() => {
    const normalTabs = tabs.value.filter((tab) => !isAffixTab(tab));
    return [...affixTabs.value, ...normalTabs].filter(Boolean);
  });
  /**
   * @zh_CN 克隆路由,防止路由被修改
   * @param route
   */
  function cloneTab(route: TabDefinition): TabDefinition {
    if (!route) return route;
    const { matched, meta, ...opt } = route;
    return {
      ...opt,
      matched: (matched
        ? matched.map((item) => ({
            meta: item.meta,
            name: item.name,
            path: item.path,
          }))
        : undefined) as RouteRecordNormalized[],
      meta: { ...meta, newTabTitle: meta.newTabTitle },
    };
  }
  /**
   * @zh_CN 是否是固定标签页
   * @param tab
   */
  function isAffixTab(tab: TabDefinition) {
    return tab?.meta?.affixTab ?? false;
  }
  /**
   * @zh_CN 是否显示标签
   * @param tab
   */
  function isTabShown(tab: TabDefinition) {
    const matched = tab?.matched ?? [];
    return !tab.meta.hideInTab && matched.every((item) => !item.meta.hideInTab);
  }
  /**
   * 从route获取tab页的key
   * @param tab
   */
  function getTabKey(tab: RouteLocationNormalized | RouteRecordNormalized) {
    const {
      fullPath,
      path,
      meta: { fullPathKey } = {},
      query = {},
    } = tab as RouteLocationNormalized;
    // pageKey可能是数组（查询参数重复时可能出现）
    const pageKey = Array.isArray(query.pageKey)
      ? query.pageKey[0]
      : query.pageKey;
    let rawKey;
    if (pageKey) {
      rawKey = pageKey;
    } else {
      rawKey = fullPathKey === false ? path : (fullPath ?? path);
    }
    try {
      return decodeURIComponent(rawKey);
    } catch {
      return rawKey;
    }
  }
  /**
   * 从tab获取tab页的key
   * 如果tab没有key,那么就从route获取key
   * @param tab
   */
  function getTabKeyFromTab(tab: TabDefinition): string {
    return tab.key ?? getTabKey(tab);
  }
  /**
   * 比较两个tab是否相等
   * @param a
   * @param b
   */
  function equalTab(a: TabDefinition, b: TabDefinition) {
    return getTabKeyFromTab(a) === getTabKeyFromTab(b);
  }
  /**
   * 获取tab的路径
   * @param route
   */
  function routeToTab(route: RouteRecordNormalized) {
    return {
      meta: route.meta,
      name: route.name,
      path: route.path,
    } as TabDefinition;
  }
  /**
   * Close tabs in bulk
   */
  async function _bulkCloseByKeys(keys: string[]) {
    const keySet = new Set(keys);
    tabs.value = tabs.value.filter(
      (item) => !keySet.has(getTabKeyFromTab(item)),
    );

    await updateCacheTabs();
  }

  /**
   * @zh_CN 关闭标签页
   * @param tab
   */
  function _close(tab: TabDefinition) {
    if (isAffixTab(tab)) return;
    const index = tabs.value.findIndex((item) => equalTab(item, tab));
    index !== -1 && tabs.value.splice(index, 1);
  }
  /**
   * @zh_CN 跳转到默认标签页
   */
  async function _goToDefaultTab(router: Router) {
    if (getTabs.value.length <= 0) {
      return;
    }
    const firstTab = getTabs.value[0];
    if (firstTab) {
      await _goToTab(firstTab, router);
    }
  }
  /**
   * @zh_CN 跳转到标签页
   * @param tab
   * @param router
   */
  async function _goToTab(tab: TabDefinition, router: Router) {
    const { params, path, query } = tab;
    const toParams = { params: params || {}, path, query: query || {} };
    await router.replace(toParams);
  }
  /**
   * @zh_CN 添加标签页
   * @param routeTab
   */
  function addTab(routeTab: TabDefinition) {
    let tab = cloneTab(routeTab);
    if (!tab.key) {
      tab.key = getTabKey(routeTab);
    }
    if (!isTabShown(tab)) {
      return tab;
    }

    const tabIndex = tabs.value.findIndex((item) => equalTab(item, tab));

    if (tabIndex === -1) {
      const preferencesStore = usePreferencesStore();
      const maxCount = preferencesStore.state.tabbar.maxCount;
      // 获取动态路由打开数，超过 0 即代表需要控制打开数
      const maxNumOfOpenTab = (routeTab?.meta?.maxNumOfOpenTab ?? -1) as number;
      // 如果动态路由层级大于 0 了，那么就要限制该路由的打开数限制了
      // 获取到已经打开的动态路由数, 判断是否大于某一个值
      if (
        maxNumOfOpenTab > 0 &&
        tabs.value.filter((tab) => tab.name === routeTab.name).length >=
          maxNumOfOpenTab
      ) {
        // 关闭第一个
        const index = tabs.value.findIndex(
          (item) => item.name === routeTab.name,
        );
        index !== -1 && tabs.value.splice(index, 1);
      } else if (maxCount > 0 && tabs.value.length >= maxCount) {
        // 关闭第一个
        const index = tabs.value.findIndex(
          (item) => !Reflect.has(item.meta, 'affixTab') || !item.meta.affixTab,
        );
        index !== -1 && tabs.value.splice(index, 1);
      }
      tabs.value.push(tab);
    } else {
      // 页面已经存在，不重复添加选项卡，只更新选项卡参数
      const currentTab = toRaw(tabs.value)[tabIndex];
      const mergedTab = {
        ...currentTab,
        ...tab,
        meta: { ...currentTab?.meta, ...tab.meta },
      };
      if (currentTab) {
        const curMeta = currentTab.meta;
        if (Reflect.has(curMeta, 'affixTab')) {
          mergedTab.meta.affixTab = curMeta.affixTab;
        }
        if (Reflect.has(curMeta, 'newTabTitle')) {
          mergedTab.meta.newTabTitle = curMeta.newTabTitle;
        }
      }
      tab = mergedTab;
      tabs.value.splice(tabIndex, 1, mergedTab);
    }
    void updateCacheTabs();
    return tab;
  }
  /**
   * @zh_CN 关闭所有标签页
   */
  async function closeAllTabs(router: Router) {
    const newTabs = tabs.value.filter((tab) => isAffixTab(tab));
    tabs.value = newTabs.length > 0 ? newTabs : [...tabs.value].splice(0, 1);
    await _goToDefaultTab(router);
    void updateCacheTabs();
  }
  /**
   * @zh_CN 关闭左侧标签页
   * @param tab
   */
  async function closeLeftTabs(tab: TabDefinition) {
    const index = tabs.value.findIndex((item) => equalTab(item, tab));

    if (index < 1) return;

    const leftTabs = tabs.value.slice(0, index);
    const keys: string[] = [];

    for (const item of leftTabs) {
      if (!isAffixTab(item)) {
        keys.push(item.key as string);
      }
    }
    await _bulkCloseByKeys(keys);
  }
  /**
   * @zh_CN 关闭其他标签页
   * @param tab
   */
  async function closeOtherTabs(tab: TabDefinition) {
    const closeKeys = tabs.value.map((item) => getTabKeyFromTab(item));

    const keys: string[] = [];

    for (const key of closeKeys) {
      if (key !== getTabKeyFromTab(tab)) {
        const closeTab = tabs.value.find(
          (item) => getTabKeyFromTab(item) === key,
        );
        if (!closeTab) {
          continue;
        }
        if (!isAffixTab(closeTab)) {
          keys.push(closeTab.key as string);
        }
      }
    }
    await _bulkCloseByKeys(keys);
  }
  /**
   * @zh_CN 关闭右侧标签页
   * @param tab
   */
  async function closeRightTabs(tab: TabDefinition) {
    const index = tabs.value.findIndex((item) => equalTab(item, tab));

    if (index !== -1 && index < tabs.value.length - 1) {
      const rightTabs = tabs.value.slice(index + 1);

      const keys: string[] = [];
      for (const item of rightTabs) {
        if (!isAffixTab(item)) {
          keys.push(item.key as string);
        }
      }
      await _bulkCloseByKeys(keys);
    }
  }
  /**
   * @zh_CN 关闭标签页
   * @param tab
   * @param router
   */
  async function closeTab(tab: TabDefinition, router: Router) {
    const { currentRoute } = router;
    // 关闭不是激活选项卡
    if (getTabKey(currentRoute.value) !== getTabKeyFromTab(tab)) {
      _close(tab);
      void updateCacheTabs();
      return;
    }
    const index = getTabs.value.findIndex(
      (item) => getTabKeyFromTab(item) === getTabKey(currentRoute.value),
    );

    const before = getTabs.value[index - 1];
    const after = getTabs.value[index + 1];

    // 下一个tab存在，跳转到下一个
    if (after) {
      _close(tab);
      await _goToTab(after, router);
      // 上一个tab存在，跳转到上一个
    } else if (before) {
      _close(tab);
      await _goToTab(before, router);
    } else {
      console.error('Failed to close the tab; only one tab remains open.');
    }
  }
  /**
   * @zh_CN 通过key关闭标签页
   * @param key
   * @param router
   */
  async function closeTabByKey(key: string, router: Router) {
    const originKey = decodeURIComponent(key);
    const index = tabs.value.findIndex(
      (item) => getTabKeyFromTab(item) === originKey,
    );
    if (index === -1) return;

    const tab = tabs.value[index];
    if (tab) {
      await closeTab(tab, router);
    }
  }
  /**
   * 根据tab的key获取tab
   * @param key
   */
  function getTabByKey(key: string) {
    return getTabs.value.find(
      (item) => getTabKeyFromTab(item) === key,
    ) as TabDefinition;
  }
  /**
   * @zh_CN 新窗口打开标签页
   * @param tab
   */
  async function openTabInNewWindow(tab: TabDefinition) {
    openRouteInNewWindow(tab.fullPath || tab.path);
  }
  /**
   * @zh_CN 固定标签页
   * @param tab
   */
  async function pinTab(tab: TabDefinition) {
    const index = tabs.value.findIndex((item) => equalTab(item, tab));
    if (index === -1) return;
    const oldTab = tabs.value[index];
    tab.meta.affixTab = true;
    tab.meta.title = oldTab?.meta?.title as string;
    tabs.value.splice(index, 1, tab);
    // 过滤固定tabs，后面更改affixTabOrder的值的话可能会有问题，目前行464排序affixTabs没有设置值
    const affixTabs = tabs.value.filter((tab) => isAffixTab(tab));
    // 获得固定tabs的index
    const newIndex = affixTabs.findIndex((item) => equalTab(item, tab));
    // 交换位置重新排序
    await sortTabs(index, newIndex);
  }
  /**
   * 刷新标签页
   */
  async function refresh(router: Router | string) {
    // 如果是Router路由，那么就根据当前路由刷新
    // 如果是string字符串，为路由名称，则定向刷新指定标签页，不能是当前路由名称，否则不会刷新
    if (typeof router === 'string') {
      return await refreshByName(router);
    }
    const { currentRoute } = router;
    const { name } = currentRoute.value;

    excludeCachedTabs.value.add(name as string);
    renderRouteView.value = false;
    window.$loadingBar?.start();

    await new Promise((resolve) => setTimeout(resolve, 200));

    excludeCachedTabs.value.delete(name as string);
    renderRouteView.value = true;
    window.$loadingBar?.finish();
  }
  /**
   * 根据路由名称刷新指定标签页
   */
  async function refreshByName(name: string) {
    excludeCachedTabs.value.add(name);
    await new Promise((resolve) => setTimeout(resolve, 200));
    excludeCachedTabs.value.delete(name);
  }
  /**
   * @zh_CN 重置标签页标题
   */
  async function resetTabTitle(tab: TabDefinition) {
    if (tab?.meta?.newTabTitle) return;
    const findTab = tabs.value.find((item) => equalTab(item, tab));
    if (findTab) {
      findTab.meta.newTabTitle = undefined;
      await updateCacheTabs();
    }
  }
  /**
   * @zh_CN 设置固定标签页
   * @param tabs
   */
  function setAffixTabs(tabs: RouteRecordNormalized[]) {
    for (const tab of tabs) {
      tab.meta.affixTab = true;
      addTab(routeToTab(tab));
    }
  }
  /**
   * @zh_CN 更新菜单列表
   * @param list
   */
  function setMenuList(list: string[]) {
    menuList.value = list;
  }
  /**
   * @zh_CN 设置标签页标题
   *
   * @zh_CN 支持设置静态标题字符串或计算属性作为动态标题
   * @zh_CN 当标题为计算属性时,标题会随计算属性值变化而自动更新
   * @zh_CN 适用于需要根据状态或多语言动态更新标题的场景
   *
   * @param {TabDefinition} tab - 标签页对象
   * @param {ComputedRef<string> | string} title - 标题内容,支持静态字符串或计算属性
   *
   * @example
   * // 设置静态标题
   * setTabTitle(tab, '新标签页');
   *
   * @example
   * // 设置动态标题
   * setTabTitle(tab, computed(() => t('common.dashboard')));
   */
  async function setTabTitle(tab: TabDefinition, title: string) {
    const findTab = tabs.value.find((item) => equalTab(item, tab));

    if (findTab) {
      findTab.meta.newTabTitle = title;
      await updateCacheTabs();
    }
  }
  /**
   * @zh_CN 设置更新时间 用于一些更新场景，使用watch深度监听的话，会损耗性能
   */
  function setUpdateTime() {
    updateTime.value = Date.now();
  }
  /**
   * @zh_CN 设置标签页顺序
   * @param oldIndex
   * @param newIndex
   */
  async function sortTabs(oldIndex: number, newIndex: number) {
    const currentTab = tabs.value[oldIndex];
    if (!currentTab) return;
    tabs.value.splice(oldIndex, 1);
    tabs.value.splice(newIndex, 0, currentTab);
    dragEndIndex.value = dragEndIndex.value + 1;
  }
  /**
   * @zh_CN 切换固定标签页
   * @param tab
   */
  async function toggleTabPin(tab: TabDefinition) {
    const affixTab = tab?.meta?.affixTab ?? false;
    await (affixTab ? unpinTab(tab) : pinTab(tab));
  }
  /**
   * @zh_CN 取消固定标签页
   * @param tab
   */
  async function unpinTab(tab: TabDefinition) {
    const index = tabs.value.findIndex((item) => equalTab(item, tab));
    if (index === -1) return;

    const oldTab = tabs.value[index];
    tab.meta.affixTab = false;
    tab.meta.title = oldTab?.meta?.title as string;
    tabs.value.splice(index, 1, tab);
    // 过滤固定tabs，后面更改affixTabOrder的值的话可能会有问题，目前行464排序affixTabs没有设置值
    const affixTabs = tabs.value.filter((tab) => isAffixTab(tab));
    // 获得固定tabs的index,使用固定tabs的下一个位置也就是活动tabs的第一个位置
    const newIndex = affixTabs.length;
    // 交换位置重新排序
    await sortTabs(index, newIndex);
  }
  /**
   * @zh_CN 根据当前打开的选项卡更新缓存
   */
  async function updateCacheTabs() {
    const cacheMap = new Set<string>();

    for (const tab of tabs.value) {
      const keepAlive = tab.meta?.keepAlive;
      if (!keepAlive) {
        continue;
      }
      (tab.matched || []).forEach((t, i) => {
        if (i > 0) {
          cacheMap.add(t.name as string);
        }
      });

      const name = tab.name as string;
      cacheMap.add(name);
    }
    cachedTabs.value = cacheMap;
  }

  return {
    cachedTabs,
    dragEndIndex,
    excludeCachedTabs,
    renderRouteView,
    tabs,
    updateTime,
    affixTabs,
    getCachedTabs,
    getExcludeCachedTabs,
    getTabs,
    getMenuList,
    _bulkCloseByKeys,
    _close,
    _goToDefaultTab,
    _goToTab,
    addTab,
    closeAllTabs,
    closeLeftTabs,
    closeOtherTabs,
    closeRightTabs,
    closeTab,
    closeTabByKey,
    getTabKey,
    getTabByKey,
    setMenuList,
    openTabInNewWindow,
    pinTab,
    refresh,
    resetTabTitle,
    setAffixTabs,
    setTabTitle,
    setUpdateTime,
    sortTabs,
    toggleTabPin,
    unpinTab,
    updateCacheTabs,
  };
});

// 解决热更新问题
const hot = import.meta.hot;
if (hot) {
  hot.accept(acceptHMRUpdate(useTabbarStore, hot));
}
