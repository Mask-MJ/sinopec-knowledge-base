<script setup lang="ts">
import type { AssistantInfo } from '@/api/assistant';

import { createProModalForm } from 'pro-naive-ui';

import { createAssistant, getAssistantList } from '@/api/assistant';

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
  const { data } = await getAssistantList({
    name: searchQuery.value,
  });
  assistantList.value = data || [];
};

const goToChat = (id: number) => {
  router.push(`/assistant/chat/${id}`);
};

watchEffect(() => {
  getData();
});
</script>

<template>
  <n-card title="聊天助手">
    <template #header-extra>
      <n-input v-model:value="searchQuery" placeholder="搜索" class="mr-4">
        <template #prefix>
          <i class="i-ant-design:search-outlined"></i>
        </template>
      </n-input>
      <n-button
        size="small"
        type="primary"
        @click="modalForm.show.value = true"
      >
        创建聊天助手
      </n-button>
    </template>

    <n-grid x-gap="12" :cols="4">
      <n-gi v-for="item in assistantList" :key="item.id">
        <n-card
          :title="item.name"
          hoverable
          class="cursor-pointer"
          @click="goToChat(item.id)"
        >
          <div>
            {{ item.description || '无描述' }}
          </div>
          <div>
            {{ item.createdAt }}
          </div>
        </n-card>
      </n-gi>
    </n-grid>
    <pro-modal-form
      :title="$t('page.assistant.addAssistant')"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.assistant.name')" path="name" required />
    </pro-modal-form>
  </n-card>
</template>
