<script setup lang="ts">
import { NText } from 'naive-ui';

import { SUPPORT_LANGUAGES } from '@/config/constants/app';
import { $t } from '@/locales';

import Breadcrumb from './widgets/breadcrumb.vue';
import Search from './widgets/search/global-search.vue';

const router = useRouter();
const tabbarStore = useTabbarStore();
const preferencesStore = usePreferencesStore();
const userStore = useUserStore();
const theme = computed(() =>
  preferencesStore.state.theme.mode === 'dark' ? 'dark' : 'light',
);
const header = computed(() => preferencesStore.state.header);
const sidebar = computed(() => preferencesStore.state.sidebar);
const mode = computed(() => preferencesStore.state.theme.mode);

const toggleSidebar = () => {
  preferencesStore.state.sidebar.collapsed = !sidebar.value.collapsed;
};
async function refresh() {
  await tabbarStore.refresh(router);
}
function renderCustomHeader() {
  return h(
    'div',
    {
      style:
        'display: flex; align-items: center; padding: 8px 12px; min-width: 200px;',
    },
    [
      h(resolveComponent('UserProfileAvatar'), {
        username: userStore.userInfo?.nickname,
        src: userStore.userInfo?.avatar,
        size: 36,
      }),
      h('div', { style: 'margin-left: 12px;' }, [
        h('div', null, [
          h(
            NText,
            { depth: 2 },
            { default: () => userStore.userInfo?.nickname || '' },
          ),
        ]),
        h('div', { style: 'font-size: 12px;' }, [
          h(
            NText,
            { depth: 3 },
            {
              default: () =>
                userStore.userInfo?.email || userStore.userInfo?.username || '',
            },
          ),
        ]),
      ]),
    ],
  );
}
const options = [
  {
    key: 'header',
    type: 'render',
    render: renderCustomHeader,
  },
  {
    key: 'header-divider',
    type: 'divider',
  },
  { label: () => $t('common.userCenter'), key: 'userInfo' },
  { label: () => $t('common.logout'), key: 'logout' },
];

function handleSelect(key: string) {
  if (key === 'logout') {
    userStore.logout();
  } else if (key === 'userInfo') {
    router.push('/profile');
  }
}
</script>

<template>
  <NCard
    v-if="header.enable"
    v-show="!header.hidden"
    :class="theme"
    class="h-12 w-full duration-200 ease-out"
    :bordered="false"
    content-class="!px-2 !py-0 flex  items-center justify-between"
    :content-style="{ 'border-bottom': '1px solid var(--n-border-color)' }"
  >
    <div class="flex items-center">
      <n-button
        quaternary
        size="small"
        class="!h-8 !w-8"
        @click="toggleSidebar"
      >
        <template #icon>
          <i
            :class="
              sidebar.collapsed
                ? 'i-ant-design:menu-unfold-outlined'
                : 'i-ant-design:menu-fold-outlined'
            "
          ></i>
        </template>
      </n-button>
      <n-button quaternary size="small" class="!h-8 !w-8" @click="refresh">
        <template #icon>
          <i class="i-ant-design:reload-outlined"></i>
        </template>
      </n-button>
      <Breadcrumb />
    </div>
    <div class="mr-2 flex-center gap-2">
      <Search />
      <NDropdown
        :options="SUPPORT_LANGUAGES"
        trigger="click"
        @select="preferencesStore.setLanguage"
      >
        <NButton quaternary circle>
          <template #icon>
            <i class="i-lucide:languages"></i>
          </template>
        </NButton>
      </NDropdown>
      <NButton quaternary circle @click="preferencesStore.setThemeMode">
        <template #icon>
          <i
            :class="{
              'i-lucide:sun': mode === 'light',
              'i-lucide:moon': mode === 'dark',
            }"
          ></i>
        </template>
      </NButton>
      <n-dropdown :options="options" size="large" @select="handleSelect">
        <UserProfileAvatar
          class="cursor-pointer"
          :size="30"
          :username="userStore.userInfo?.nickname"
          :src="userStore.userInfo?.avatar"
        />
      </n-dropdown>
    </div>
  </NCard>
</template>
