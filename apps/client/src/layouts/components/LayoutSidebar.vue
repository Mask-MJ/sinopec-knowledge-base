<script setup lang="ts" name="LayoutSidebar">
import type { MenuInfo } from '@/api/system/menu';
import type { MenuOption } from 'naive-ui';

import { RouterLink } from 'vue-router';

import { DEFAULT_HOME_PATH } from '@/config/constants';
import { $t } from '@/locales';
import { transformationTree } from '@/utils';

const route = useRoute();
const userStore = useUserStore();
const preferencesStore = usePreferencesStore();

const appName = computed(() => preferencesStore.state.app.name);
const sidebar = computed(() => preferencesStore.state.sidebar);
const theme = computed(() => preferencesStore.state.theme);
const activeKey = computed(() => route.path);
const renderIcon = (options: MenuInfo) => {
  let iconName = options.icon;
  if (activeKey.value === options.path) {
    iconName = options.activeIcon || options.icon;
  }
  return () => h('i', { class: iconName });
};
const transformMenuOptions = (options: MenuInfo[]): MenuOption[] => {
  return options
    .filter((option) => option.status && !option.hideInMenu)
    .map((option) => {
      const menuOption: MenuOption = {
        key: option.path,
        label: () =>
          option.type === 'catalog'
            ? h(
                'span',
                null,
                option.title ? $t(`page.${option.title}`) : option.name,
              )
            : h(
                RouterLink,
                { to: option.path },
                {
                  default: () =>
                    option.title ? $t(`page.${option.title}`) : option.name,
                },
              ),
        icon: renderIcon(option),
        disabled: !option.status,
      };
      if (option.children?.length) {
        menuOption.children = option.hideChildrenInMenu
          ? undefined
          : transformMenuOptions(option.children);
      }
      if (menuOption.children?.length === 0) {
        delete menuOption.children;
      }
      return menuOption;
    });
};
const menuOptions = computed<MenuOption[]>(() => {
  const menusTree = transformationTree(userStore.accessMenus, null);
  return transformMenuOptions(menusTree);
});
</script>

<template>
  <div class="h-full flex flex-col items-stretch">
    <NCard content-class="!p-0" :bordered="false">
      <RouterLink
        :to="DEFAULT_HOME_PATH"
        class="h-12 w-full flex items-center overflow-hidden whitespace-nowrap border-b-1 border-[var(--n-border-color)]"
      >
        <img src="@/assets/logo.png" width="30" height="30" class="ml-4 mr-2" />
        <h2
          v-show="!sidebar.collapsed"
          class="pl-8px text-align-center text-16px text-primary font-bold transition duration-300 ease-in-out"
        >
          {{ appName }}
        </h2>
      </RouterLink>
    </NCard>

    <NScrollbar class="flex-1 overflow-hidden">
      <NMenu
        class="side-menu"
        :value="activeKey"
        :collapsed="sidebar.collapsed"
        :collapsed-icon-size="22"
        :options="menuOptions"
        default-expand-all
        :indent="18"
        :inverted="theme.semiDarkSidebar"
      />
    </NScrollbar>
  </div>
</template>
