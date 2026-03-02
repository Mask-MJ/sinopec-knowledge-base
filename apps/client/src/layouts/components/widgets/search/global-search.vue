<script setup lang="ts">
import { useMagicKeys, whenever } from '@vueuse/core';
import { ref } from 'vue';

import { $t } from '@/locales';

import SearchPanel from './search-panel.vue';

defineOptions({ name: 'GlobalSearch' });

const keyword = ref('');
const showModal = ref(false);

function handleClose() {
  keyword.value = '';
  showModal.value = false;
}

const keys = useMagicKeys();
whenever(keys['ctrl+k']!, () => {
  showModal.value = true;
});

const preventDefaultBrowserSearchHotKey = (event: KeyboardEvent) => {
  if (event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
  }
};

const toggleKeydownListener = () => {
  window.addEventListener('keydown', preventDefaultBrowserSearchHotKey);
};

onMounted(() => {
  toggleKeydownListener();

  onUnmounted(() => {
    window.removeEventListener('keydown', preventDefaultBrowserSearchHotKey);
  });
});
</script>

<template>
  <div>
    <NModal v-model:show="showModal">
      <NCard
        :bordered="false"
        size="huge"
        role="dialog"
        aria-modal="true"
        class="top-10vh"
        style="
          width: 600px;
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
        "
        header-class="!py-2 !px-4"
        header-style="border-bottom: 1px solid var(--n-border-color)"
        content-class="!px-4 !py-2"
        footer-class="!m-0 !py-2"
        :segmented="{
          content: true,
          footer: 'soft',
        }"
      >
        <template #header>
          <div class="flex items-center">
            <i
              class="i-ant-design:search-outlined mr-2 size-4 text-gray-500"
            ></i>
            <input
              v-model="keyword"
              :placeholder="$t('ui.widgets.search.searchNavigate')"
              class="w-[80%] border rounded-md border-none bg-transparent p-2 pl-0 text-sm font-normal outline-none ring-0 ring-none ring-offset-transparent placeholder:text-gray-500 focus-visible:ring-transparent"
            />
          </div>
        </template>
        <SearchPanel :keyword="keyword" @close="handleClose" />
        <template #footer>
          <div class="w-full flex justify-start text-xs">
            <div class="mx-2 flex items-center">
              <i class="i-ant-design:enter-outlined mr-1 size-3"></i>
              {{ $t('ui.widgets.search.select') }}
            </div>
            <div class="mr-2 flex items-center">
              <i class="i-ant-design:arrow-up-outlined mr-1 size-3"></i>
              <i class="i-ant-design:arrow-down-outlined mr-1 size-3"></i>
              {{ $t('ui.widgets.search.navigate') }}
            </div>
            <div class="flex items-center">
              Esc {{ $t('ui.widgets.search.close') }}
            </div>
          </div>
        </template>
      </NCard>
    </NModal>
    <div
      class="flex-center cursor-pointer border-gray-700 rounded-2xl bg-layout px-2 py-1 text-gray-500 dark:border-1 hover:text-base-text"
      @click="showModal = true"
    >
      <i class="i-ant-design:search-outlined mr-2 size-4 hover:opacity-100"></i>
      <span class="mr-2 hidden text-xs duration-300 md:block">
        {{ $t('ui.widgets.search.title') }}
      </span>
      <span
        class="relative hidden rounded-sm rounded-r-xl bg-container px-1.5 py-1 text-xs leading-none md:block group-hover:opacity-100"
      >
        Ctrl K
      </span>
    </div>
  </div>
</template>
