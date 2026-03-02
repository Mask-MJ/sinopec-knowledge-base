<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui';

import {
  darkTheme,
  dateZhCN,
  NConfigProvider,
  useOsTheme,
  zhCN,
} from 'naive-ui';
import { RouterView } from 'vue-router';

import NaiveProvider from '@/components/common/NaiveProvider.vue';

const osTheme = useOsTheme();
const isDark = computed(() => osTheme.value === 'dark');
const theme = computed(() => (isDark.value ? darkTheme : null));

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2563EB',
    primaryColorHover: '#3B82F6',
    primaryColorPressed: '#1D4ED8',
  },
};
</script>

<template>
  <NConfigProvider
    :date-locale="dateZhCN"
    :locale="zhCN"
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <NaiveProvider>
      <RouterView />
    </NaiveProvider>
  </NConfigProvider>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}
</style>
