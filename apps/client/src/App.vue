<script setup lang="ts">
import type { WatermarkProps } from 'naive-ui';

import { darkTheme, dateEnUS, dateZhCN, NAlert, NButton } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { enUS, zhCN } from 'pro-naive-ui';
import { RouterView } from 'vue-router';

import { useVersionCheck } from '@/composables/useVersionCheck';
import { $t } from '@/locales';

import { getNaiveTheme } from './config/preferences';

const userStore = useUserStore();
const preferencesStore = usePreferencesStore();
const { userInfo } = storeToRefs(userStore);
const { state } = storeToRefs(preferencesStore);
const { handleRefresh, showUpdateBanner } = useVersionCheck();

// 应用启动时把持久化偏好与系统级暗黑标志位对齐，避免 html.dark class 与
// 用户上次保存的主题状态不一致。
useDark().value = preferencesStore.isDarkTheme;
const naiveTheme = computed(() => {
  const { error, info, primary, success, warning } = state.value.theme;
  return getNaiveTheme({ error, info, primary, success, warning });
});

const naiveDarkTheme = computed(() =>
  state.value.theme.mode === 'dark' ? darkTheme : undefined,
);
const naiveLocale = computed(() =>
  state.value.app.locale === 'zh-CN' ? zhCN : enUS,
);
const naiveDateLocale = computed(() =>
  state.value.app.locale === 'zh-CN' ? dateZhCN : dateEnUS,
);
const watermarkProps = computed<WatermarkProps>(() => {
  return {
    content: userInfo.value?.username || state.value.app.name,
    cross: true,
    fullscreen: true,
    fontSize: 16,
    lineHeight: 16,
    width: 384,
    height: 384,
    xOffset: 12,
    yOffset: 60,
    rotate: -15,
    zIndex: 9999,
  };
});
</script>

<template>
  <pro-config-provider
    :theme="naiveDarkTheme"
    :theme-overrides="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    class="h-full"
  >
    <NaiveProvider>
      <NAlert
        v-if="showUpdateBanner"
        type="warning"
        :show-icon="false"
        class="fixed left-4 right-4 top-4 z-[2100] shadow-lg"
      >
        <template #header>
          {{ $t('ui.widgets.checkUpdatesTitle') }}
        </template>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ $t('ui.widgets.checkUpdatesDescription') }}</span>
          <NButton type="warning" text @click="handleRefresh">
            {{ $t('common.refresh') }}
          </NButton>
        </div>
      </NAlert>
      <RouterView class="bg-layout" />
      <NWatermark v-if="state.app.watermark" v-bind="watermarkProps" />
    </NaiveProvider>
    <NGlobalStyle />
  </pro-config-provider>
</template>

<style scoped></style>
