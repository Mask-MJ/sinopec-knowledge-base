<script setup lang="ts" name="LayoutContent">
import type {
  RouteLocationNormalizedLoaded,
  RouteLocationNormalizedLoadedGeneric,
} from 'vue-router';

import { storeToRefs } from 'pinia';

const tabbarStore = useTabbarStore();
const preferencesStore = usePreferencesStore();
const keepAlive = computed(() => preferencesStore.state.tabbar.keepAlive);
const { getCachedTabs, getExcludeCachedTabs, renderRouteView } =
  storeToRefs(tabbarStore);
/**
 * 是否使用动画
 */
const getEnabledTransition = computed(() => {
  return (
    preferencesStore.state.transition.enable &&
    preferencesStore.state.transition.name
  );
});
// 页面切换动画
function getTransitionName(_route: RouteLocationNormalizedLoaded) {
  // 如果偏好设置未设置，则不使用动画
  const { tabbar, transition } = preferencesStore.state;
  const transitionName = transition.name;
  if (!transitionName || !transition.enable) {
    return;
  }

  // 标签页未启用或者未开启缓存，则使用全局配置动画
  if (!tabbar.enable || !keepAlive) {
    return transitionName;
  }

  return transitionName;
}
/**
 * 转换组件，自动添加 name
 * @param component
 */
function transformComponent(
  component: VNode,
  route: RouteLocationNormalizedLoadedGeneric,
) {
  // 组件视图未找到，如果有设置后备视图，则返回后备视图，如果没有，则抛出错误
  if (!component) {
    console.error(
      'Component view not found，please check the route configuration',
    );
    return undefined;
  }

  const routeName = route.name as string;
  // 如果组件没有 name，则直接返回
  if (!routeName) {
    return component;
  }
  const componentName = (component?.type as any)?.name;

  // 已经设置过 name，则直接返回
  if (componentName) {
    return component;
  }

  // 设置 name
  component.type ||= {};
  (component.type as any).name = routeName;

  return component;
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition
      v-if="getEnabledTransition"
      :name="getTransitionName(route)"
      mode="out-in"
      appear
    >
      <KeepAlive
        v-if="keepAlive"
        :exclude="getExcludeCachedTabs"
        :include="getCachedTabs"
      >
        <component
          :is="transformComponent(Component, route)"
          v-if="renderRouteView"
          :key="tabbarStore.getTabKey(route)"
        />
      </KeepAlive>
      <component
        :is="Component"
        v-else-if="renderRouteView"
        :key="tabbarStore.getTabKey(route)"
      />
    </Transition>
    <template v-else>
      <KeepAlive
        v-if="keepAlive"
        :exclude="getExcludeCachedTabs"
        :include="getCachedTabs"
      >
        <component
          :is="transformComponent(Component, route)"
          v-if="renderRouteView"
          v-show="!route.meta.iframeSrc"
          :key="tabbarStore.getTabKey(route)"
        />
      </KeepAlive>
      <component
        :is="Component"
        v-else-if="renderRouteView"
        :key="tabbarStore.getTabKey(route)"
      />
    </template>
  </RouterView>
</template>
