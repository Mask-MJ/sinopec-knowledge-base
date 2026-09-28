<script setup lang="ts">
import type { DropdownOption } from 'naive-ui';

import { RouterView } from 'vue-router';

import { BACKEND_HOME_PATH, DEFAULT_HOME_PATH } from '@/config/constants';
import { $t } from '@/locales';

// 前台布局：只有顶栏（LOGO + 头像菜单），不带后台的侧栏和标签栏。
const router = useRouter();
const userStore = useUserStore();
const preferencesStore = usePreferencesStore();

const appName = computed(() => preferencesStore.state.app.name);

// 普通用户只有「退出登录」；管理员多一个「后台管理」
const menuOptions = computed<DropdownOption[]>(() => [
  ...(userStore.userInfo?.isAdmin
    ? [{ label: $t('page.portal.backend'), key: 'backend' }]
    : []),
  { label: $t('common.logout'), key: 'logout' },
]);

function handleSelect(key: string) {
  if (key === 'backend') {
    router.push(BACKEND_HOME_PATH);
  } else if (key === 'logout') {
    // 以后接统一登录，退出只保留 userStore.logout() 这一个出口
    userStore.logout();
  }
}
</script>

<template>
  <NLayout
    class="h-full w-full"
    content-style="display:flex; flex-flow: column; height: 100%"
  >
    <NLayoutHeader
      bordered
      class="h-14 flex shrink-0 items-center justify-between px-4"
    >
      <RouterLink :to="DEFAULT_HOME_PATH" class="flex items-center gap-2">
        <img src="@/assets/logo.png" width="30" height="30" alt="logo" />
        <span class="text-18px text-primary font-bold">{{ appName }}</span>
      </RouterLink>

      <NDropdown
        :options="menuOptions"
        trigger="click"
        size="large"
        @select="handleSelect"
      >
        <div class="flex cursor-pointer items-center gap-2">
          <UserProfileAvatar
            :size="30"
            :username="userStore.userInfo?.nickname"
            :src="userStore.userInfo?.avatar"
          />
          <span class="text-sm">{{ userStore.userInfo?.nickname }}</span>
        </div>
      </NDropdown>
    </NLayoutHeader>

    <NLayoutContent
      class="min-h-0 flex-1 bg-[#f6f9f8] dark:bg-[#101014]"
      content-style="height: 100%"
    >
      <RouterView />
    </NLayoutContent>
  </NLayout>
</template>
