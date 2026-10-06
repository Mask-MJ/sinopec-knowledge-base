<script setup lang="ts">
import { $t } from '@/locales';

const preferencesStore = usePreferencesStore();
const appName = computed(() => preferencesStore.state.app.name);

const entries = computed(() => [
  {
    to: '/qa',
    icon: 'i-ant-design:message-outlined',
    title: $t('page.portal.qa'),
    desc: $t('page.portal.qaDesc'),
  },
  {
    to: '/weekly',
    icon: 'i-ant-design:file-text-outlined',
    title: $t('page.portal.weekly'),
    desc: $t('page.portal.weeklyDesc'),
  },
]);
</script>

<template>
  <div class="h-full flex-col-center gap-12 p-6">
    <div class="flex-col-center gap-3">
      <img src="@/assets/logo.png" width="72" height="72" alt="logo" />
      <h1 class="text-32px text-primary font-bold">{{ appName }}</h1>
      <p class="text-base opacity-60">{{ $t('page.portal.subtitle') }}</p>
    </div>

    <div class="flex flex-wrap justify-center gap-8">
      <RouterLink v-for="item in entries" :key="item.to" :to="item.to">
        <NCard
          hoverable
          class="w-60 cursor-pointer text-center"
          content-class="flex-col-center gap-3 !py-8"
        >
          <i :class="item.icon" class="text-48px text-primary"></i>
          <span class="text-lg font-semibold">{{ item.title }}</span>
          <span class="text-sm opacity-60">{{ item.desc }}</span>
        </NCard>
      </RouterLink>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: front
  title: page.portal.title
  hideInTab: true
</route>
