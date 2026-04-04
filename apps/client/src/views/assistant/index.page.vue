<script setup lang="ts">
import type { AssistantInfo } from '@/api/assistant';

import { createProModalForm } from 'pro-naive-ui';

import { createAssistant, getAssistantList } from '@/api/assistant';
import { $t } from '@/locales';

const router = useRouter();
const loading = ref(false);
const assistantList = ref<AssistantInfo[]>([]);
const searchQuery = ref('');

const modalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    await createAssistant(values);
    modalForm.close();
    loading.value = false;
    getData();
  },
});

const getData = async () => {
  loading.value = true;
  try {
    const { data } = await getAssistantList({
      name: searchQuery.value,
    });
    assistantList.value = data?.list ?? [];
  } finally {
    loading.value = false;
  }
};

const goToChat = (id: number) => {
  router.push(`/assistant/chat/${id}`);
};

watchEffect(() => {
  getData();
});
</script>

<template>
  <n-card :title="$t('page.assistant.title')">
    <template #header-extra>
      <n-flex align="center">
        <n-input
          v-model:value="searchQuery"
          :placeholder="$t('common.search')"
          clearable
          class="w-60"
        >
          <template #prefix>
            <i class="i-ant-design:search-outlined"></i>
          </template>
        </n-input>
        <n-button type="primary" @click="modalForm.show.value = true">
          <template #icon>
            <i class="i-ant-design:plus-outlined"></i>
          </template>
          {{ $t('page.assistant.addAssistant') }}
        </n-button>
      </n-flex>
    </template>

    <n-spin :show="loading">
      <n-empty
        v-if="assistantList.length === 0 && !loading"
        :description="$t('common.noData')"
        class="py-16"
      />
      <n-grid
        v-else
        x-gap="16"
        y-gap="16"
        cols="1 s:2 m:3 l:4"
        responsive="screen"
      >
        <n-gi v-for="item in assistantList" :key="item.id">
          <n-card
            hoverable
            class="cursor-pointer transition-shadow duration-200 hover:shadow-lg"
            @click="goToChat(item.id)"
          >
            <template #header>
              <n-flex align="center" :size="8">
                <n-avatar :size="32" round class="bg-primary">
                  <i class="i-ant-design:robot-outlined text-lg"></i>
                </n-avatar>
                <n-ellipsis :line-clamp="1" class="text-base font-medium">
                  {{ item.name }}
                </n-ellipsis>
              </n-flex>
            </template>
            <n-ellipsis :line-clamp="2" class="min-h-10 text-sm text-gray-500">
              {{ item.description || $t('common.noDescription') }}
            </n-ellipsis>
            <template #footer>
              <n-text depth="3" class="text-xs">
                {{ item.createdAt }}
              </n-text>
            </template>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
    <pro-modal-form
      :title="$t('page.assistant.addAssistant')"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.assistant.name')" path="name" required />
      <pro-textarea
        :title="$t('page.assistant.description')"
        path="description"
      />
    </pro-modal-form>
  </n-card>
</template>
