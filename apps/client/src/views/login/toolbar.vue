<script setup lang="ts">
import type { DropdownOption } from 'naive-ui';

import { SUPPORT_LANGUAGES } from '@/config/constants/app';
import { COLOR_PRESETS } from '@/config/preferences';
import { $t } from '@/locales';

defineOptions({ name: 'AuthenticationToolbar' });

const { state, setThemeColor, setThemeMode, setAuthPageLayout, setLanguage } =
  usePreferencesStore();
const builtinType = computed(() => state.theme.builtinType);
const mode = computed(() => state.theme.mode);
const menus = computed((): DropdownOption[] => [
  {
    icon: () => h('i', { class: 'i-lucide:panel-left size-4' }),
    label: $t('authentication.layout.alignLeft'),
    key: 'panel-left',
  },
  {
    icon: () => h('i', { class: 'i-lucide:inspection-panel size-4' }),
    label: $t('authentication.layout.center'),
    key: 'panel-center',
  },
  {
    icon: () => h('i', { class: 'i-lucide:panel-right size-4' }),
    label: $t('authentication.layout.alignRight'),
    key: 'panel-right',
  },
]);
const authPageLayout = computed(() => state.app.authPageLayout);
</script>

<template>
  <div class="absolute right-2 top-4 z-10">
    <NCard class="rounded-3xl" content-class=" flex-center !px-3 !py-1">
      <div class="group relative flex-center overflow-hidden">
        <div
          class="w-0 flex overflow-hidden transition-all duration-500 ease-out group-hover:w-60"
        >
          <template v-for="preset in COLOR_PRESETS" :key="preset.color">
            <NButton
              quaternary
              circle
              class="flex-center flex-shrink-0"
              @click="setThemeColor(preset)"
            >
              <div
                :style="{ backgroundColor: preset.color }"
                class="relative size-5 flex-center rounded-full hover:scale-110"
              >
                <svg
                  v-if="builtinType === preset.type"
                  class="h-3.5 w-3.5 text-white"
                  height="1em"
                  viewBox="0 0 15 15"
                  width="1em"
                >
                  <path
                    clip-rule="evenodd"
                    d="M11.467 3.727c.289.189.37.576.181.865l-4.25 6.5a.625.625 0 0 1-.944.12l-2.75-2.5a.625.625 0 0 1 .841-.925l2.208 2.007l3.849-5.886a.625.625 0 0 1 .865-.181"
                    fill="currentColor"
                    fill-rule="evenodd"
                  />
                </svg>
              </div>
            </NButton>
          </template>
        </div>

        <NButton quaternary circle>
          <template #icon>
            <i class="i-lucide:palette size-4 text-primary"></i>
          </template>
        </NButton>
      </div>
      <NDropdown :options="menus" trigger="click" @select="setAuthPageLayout">
        <NButton quaternary circle>
          <template #icon>
            <i
              :class="{
                'i-lucide:panel-left': authPageLayout === 'panel-left',
                'i-lucide:inspection-panel': authPageLayout === 'panel-center',
                'i-lucide:panel-right': authPageLayout === 'panel-right',
              }"
              class="size-4"
            ></i>
          </template>
        </NButton>
      </NDropdown>
      <NDropdown
        :options="SUPPORT_LANGUAGES"
        trigger="click"
        @select="setLanguage"
      >
        <NButton quaternary circle>
          <template #icon>
            <i class="i-lucide:languages"></i>
          </template>
        </NButton>
      </NDropdown>
      <NButton quaternary circle @click="setThemeMode">
        <template #icon>
          <i
            :class="{
              'i-lucide:sun': mode === 'light',
              'i-lucide:moon': mode === 'dark',
            }"
          ></i>
        </template>
      </NButton>
    </NCard>
  </div>
</template>
