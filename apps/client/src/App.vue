<script setup lang="ts">
import type { WatermarkProps } from 'naive-ui';

import { darkTheme, dateEnUS, dateZhCN } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { enUS, zhCN } from 'pro-naive-ui';
import { RouterView } from 'vue-router';

import { getNaiveTheme } from './config/preferences';

const userStore = useUserStore();
const preferencesStore = usePreferencesStore();
const { userInfo } = storeToRefs(userStore);
const { state } = storeToRefs(preferencesStore);
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
      <RouterView class="bg-layout" />
      <NWatermark v-if="state.app.watermark" v-bind="watermarkProps" />
    </NaiveProvider>
    <NGlobalStyle />
  </pro-config-provider>
</template>

<style scoped></style>
