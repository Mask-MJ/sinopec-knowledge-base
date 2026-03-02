<script lang="ts" setup>
import { $t } from '@/locales';

import AuthenticationForm from './form.vue';
import Toolbar from './toolbar.vue';

defineOptions({ name: 'Login' });

const preferencesStore = usePreferencesStore();

const appName = computed(() => preferencesStore.state.app.name);
const logo = computed(() => preferencesStore.state.logo.source);
const authPageLayout = computed(
  () => preferencesStore.state.app.authPageLayout,
);
</script>

<template>
  <div class="min-h-full flex flex-1 select-none overflow-x-hidden">
    <!-- 头部 Logo 和应用名称 -->
    <div v-if="logo || appName" class="absolute left-0 top-0 z-10 flex flex-1">
      <div class="ml-4 mt-4 flex flex-1 items-center sm:left-6 sm:top-6">
        <img v-if="logo" :alt="appName" :src="logo" class="mr-2" width="42" />
        <p v-if="appName" class="m-0 text-xl font-medium">
          {{ appName }}
        </p>
      </div>
    </div>
    <Toolbar />
    <!-- 左侧认证面板 -->
    <NCard
      v-if="authPageLayout === 'panel-left'"
      class="min-h-full w-2/5 max-lg:flex-1"
      transition-name="slide-left"
      :bordered="false"
    >
      <AuthenticationForm />
    </NCard>
    <!-- 系统介绍 -->
    <NCard
      v-if="authPageLayout !== 'panel-center'"
      :bordered="false"
      class="relative hidden flex-1 lg:block"
    >
      <div class="absolute inset-0 h-full w-full">
        <div class="login-background absolute left-0 top-0 size-full"></div>
        <div class="-enter-x mr-20 h-full flex-col-center">
          <div class="mt-6 text-xl font-sans lg:text-2xl">
            {{ $t('authentication.pageTitle') }}
          </div>
          <div class="mt-2">
            {{ $t('authentication.pageDesc') }}
          </div>
        </div>
      </div>
    </NCard>
    <!-- 中心认证面板 -->
    <div
      v-if="authPageLayout === 'panel-center'"
      class="relative w-full flex-center"
    >
      <div class="login-background absolute left-0 top-0 size-full"></div>
      <NCard
        class="w-full rounded-3xl pb-20 shadow-primary/5 lg:w-1/2 md:w-2/3 xl:w-[36%]"
      >
        <AuthenticationForm />
      </NCard>
    </div>
    <!-- 右侧认证面板 -->
    <NCard
      v-if="authPageLayout === 'panel-right'"
      :bordered="false"
      class="min-h-full w-[34%] max-lg:flex-1"
    >
      <AuthenticationForm />
    </NCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: content
  ignoreAccess: true
</route>

<style scoped>
.login-background {
  background: linear-gradient(
    154deg,
    #0707094d 30%,
    rgb(var(--primary-color)) 48%,
    #0707094d 64%
  );
  filter: blur(100px);
  opacity: 0.3;
}
</style>
