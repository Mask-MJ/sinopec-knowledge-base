<script setup lang="ts">
import type { AssistantInfo } from '@/api/assistant';

import { createProModalForm } from 'pro-naive-ui';

import {
  createAssistant,
  deleteAssistant,
  getAssistantList,
} from '@/api/assistant';
import { useKnowledgeBaseOptions, useLlmOptions } from '@/composables';
import { $t } from '@/locales';

const { options: chatModelOptions, loading: llmLoading } =
  useLlmOptions('chat');
const { options: kbOptions, loading: kbLoading } = useKnowledgeBaseOptions();

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

// 模型列表加载完成后，默认选中第一个
watch(chatModelOptions, (opts) => {
  const first = opts[0];
  if (first && !modalForm.values.value?.modelName) {
    modalForm.values.value = {
      ...modalForm.values.value,
      modelName: first.value,
    };
  }
});

const getData = async () => {
  loading.value = true;
  try {
    const { data } = await getAssistantList({
      name: searchQuery.value,
      pageSize: 1000,
    });
    assistantList.value = data?.list ?? [];
  } finally {
    loading.value = false;
  }
};

const goToChat = (id: number) => {
  router.push(`/assistant/chat/${id}`);
};

const handleDelete = async (e: MouseEvent, id: number) => {
  e.stopPropagation();
  window.$dialog.warning({
    title: '确认删除',
    content: '删除后无法恢复，确定要删除该助手吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteAssistant(id);
      window.$message.success('删除成功');
      getData();
    },
  });
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
              <n-flex justify="space-between" align="center">
                <n-text depth="3" class="text-xs">
                  {{ item.createdAt }}
                </n-text>
                <n-button
                  v-if="!item.isGeneral"
                  text
                  type="error"
                  size="tiny"
                  @click="(e: MouseEvent) => handleDelete(e, item.id)"
                >
                  <template #icon>
                    <i class="i-ant-design:delete-outlined"></i>
                  </template>
                </n-button>
              </n-flex>
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
      <pro-select
        :title="$t('page.assistant.permission.title')"
        required
        path="permission"
        :field-props="{
          options: [
            { label: $t('page.assistant.permission.me'), value: 'me' },
            { label: $t('page.assistant.permission.team'), value: 'team' },
            { label: $t('page.assistant.permission.public'), value: 'public' },
          ],
        }"
      />
      <pro-select
        :title="$t('page.assistant.model')"
        path="modelName"
        :field-props="{
          options: chatModelOptions,
          loading: llmLoading,
          filterable: true,
          placeholder: '请选择聊天模型',
        }"
      />
      <pro-select
        :title="$t('page.assistant.knowledgeBase')"
        path="datasetIds"
        :field-props="{
          options: kbOptions,
          loading: kbLoading,
          multiple: true,
          filterable: true,
          placeholder: '请选择关联知识库',
        }"
      />
      <pro-textarea
        :title="$t('page.assistant.description')"
        path="description"
      />
    </pro-modal-form>
  </n-card>
</template>
