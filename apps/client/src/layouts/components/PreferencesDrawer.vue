<script setup lang="ts">
import type { PageTransitionType } from '@/config/preferences';

import { useI18n } from 'vue-i18n';

import { BUILT_IN_THEME_PRESETS } from '@/config/preferences';

const drawerVisible = defineModel<boolean>('show', { required: true });

const { t } = useI18n();
const preferencesStore = usePreferencesStore();
const message = useMessage();
const dialog = useDialog();

// ===== Theme =====
const isDarkMode = computed({
  get: () => preferencesStore.state.theme.mode === 'dark',
  set: (val) => {
    preferencesStore.state.theme.mode = val ? 'dark' : 'light';
    useDark().value = val;
  },
});

const currentThemeType = computed(
  () => preferencesStore.state.theme.builtinType,
);

function handleSelectTheme(preset: (typeof BUILT_IN_THEME_PRESETS)[number]) {
  if (preset.type === 'custom') return;
  preferencesStore.setThemeColor(preset);
}

// ===== Tabbar =====
const tabbarEnabled = computed({
  get: () => preferencesStore.state.tabbar.enable,
  set: (val) => {
    preferencesStore.state.tabbar.enable = val;
  },
});

const keepAliveEnabled = computed({
  get: () => preferencesStore.state.tabbar.keepAlive,
  set: (val) => {
    preferencesStore.state.tabbar.keepAlive = val;
  },
});

// ===== Transition =====
const transitionEnabled = computed({
  get: () => preferencesStore.state.transition.enable,
  set: (val) => {
    preferencesStore.state.transition.enable = val;
  },
});

const transitionOptions: { label: string; value: PageTransitionType }[] = [
  { label: 'Fade Slide', value: 'fade-slide' },
  { label: 'Fade', value: 'fade' },
  { label: 'Fade Up', value: 'fade-up' },
  { label: 'Fade Down', value: 'fade-down' },
];

const transitionName = computed({
  get: () => preferencesStore.state.transition.name as PageTransitionType,
  set: (val) => {
    preferencesStore.state.transition.name = val;
  },
});

// ===== Sidebar =====
const sidebarWidth = computed({
  get: () => preferencesStore.state.sidebar.width,
  set: (val) => {
    preferencesStore.state.sidebar.width = val;
  },
});

// ===== Reset =====
function handleReset() {
  dialog.warning({
    title: t('preferences.resetTitle'),
    content: t('preferences.resetTip'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      preferencesStore.$reset();
      message.success(t('preferences.resetSuccess'));
    },
  });
}
</script>

<template>
  <NDrawer v-model:show="drawerVisible" :width="360" placement="right">
    <NDrawerContent :title="t('preferences.title')" closable>
      <NSpace vertical :size="20">
        <!-- 主题 -->
        <div>
          <div class="mb-3 text-sm font-medium">
            {{ t('preferences.theme.title') }}
          </div>

          <!-- 亮/暗模式 -->
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm">{{ t('preferences.mode') }}</span>
            <NSwitch v-model:value="isDarkMode" size="small">
              <template #checked>
                <i class="i-lucide:moon text-xs"></i>
              </template>
              <template #unchecked>
                <i class="i-lucide:sun text-xs"></i>
              </template>
            </NSwitch>
          </div>

          <!-- 主题色预设 -->
          <div class="mb-1 text-xs text-gray-500">
            {{ t('preferences.theme.builtin.title') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <NTooltip
              v-for="preset in BUILT_IN_THEME_PRESETS.filter(
                (p) => p.type !== 'custom',
              )"
              :key="preset.type"
              :delay="300"
            >
              <template #trigger>
                <div
                  class="h-6 w-6 cursor-pointer border-2 rounded-full transition-all"
                  :class="
                    currentThemeType === preset.type
                      ? 'scale-110 border-[var(--primary-color)]'
                      : 'border-transparent hover:scale-105'
                  "
                  :style="{ backgroundColor: preset.color }"
                  @click="handleSelectTheme(preset)"
                >
                  <div
                    v-if="currentThemeType === preset.type"
                    class="h-full w-full flex items-center justify-center"
                  >
                    <i class="i-lucide:check text-xs text-white"></i>
                  </div>
                </div>
              </template>
              {{ preset.type }}
            </NTooltip>
          </div>
        </div>

        <NDivider class="!my-0" />

        <!-- 标签页 -->
        <div>
          <div class="mb-3 text-sm font-medium">
            {{ t('preferences.tabbar.title') }}
          </div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm">{{ t('preferences.tabbar.enable') }}</span>
            <NSwitch v-model:value="tabbarEnabled" size="small" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">{{ t('preferences.tabbar.keepAlive') }}</span>
            <NSwitch
              v-model:value="keepAliveEnabled"
              size="small"
              :disabled="!tabbarEnabled"
            />
          </div>
        </div>

        <NDivider class="!my-0" />

        <!-- 页面切换动画 -->
        <div>
          <div class="mb-3 text-sm font-medium">
            {{ t('preferences.transition.transition') }}
          </div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm">{{
              t('preferences.transition.transition')
            }}</span>
            <NSwitch v-model:value="transitionEnabled" size="small" />
          </div>
          <div v-if="transitionEnabled" class="flex items-center justify-between">
            <span class="text-sm">{{ t('preferences.mode') }}</span>
            <NSelect
              v-model:value="transitionName"
              :options="transitionOptions"
              size="small"
              class="!w-36"
            />
          </div>
        </div>

        <NDivider class="!my-0" />

        <!-- 侧边栏 -->
        <div>
          <div class="mb-3 text-sm font-medium">
            {{ t('preferences.sidebar.title') }}
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">{{ t('preferences.sidebar.width') }}</span>
            <NSlider
              v-model:value="sidebarWidth"
              :min="180"
              :max="300"
              :step="4"
              class="!w-36"
            />
          </div>
          <div class="mt-1 text-right text-xs text-gray-400">
            {{ sidebarWidth }}px
          </div>
        </div>
      </NSpace>

      <template #footer>
        <NButton secondary block type="warning" @click="handleReset">
          <template #icon>
            <i class="i-lucide:rotate-ccw"></i>
          </template>
          {{ t('preferences.resetTitle') }}
        </NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
