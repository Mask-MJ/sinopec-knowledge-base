<script setup lang="ts">
import { createProDrawerForm } from 'pro-naive-ui';

import { getAssistantDetail, updateAssistant } from '@/api/assistant';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';
import { useKnowledgeBaseOptions, useLlmOptions } from '@/composables';

const router = useRouter();
const loading = ref(false);
const activeId = ref<string>();
const verified = ref(false);

const assistantId = computed(() => {
  const id = Number(router.currentRoute.value.params.id);
  return Number.isFinite(id) && id > 0 ? id : 0;
});

onMounted(async () => {
  if (!assistantId.value) {
    router.replace('/assistant');
    return;
  }
  try {
    await getAssistantDetail(assistantId.value);
    verified.value = true;
  } catch {
    window.$message.error('助手不存在或已被删除');
    router.replace('/assistant');
  }
});

const { options: kbOptions, loading: kbLoading } = useKnowledgeBaseOptions();
const { options: rerankOptions, loading: rerankLoading } =
  useLlmOptions('rerank');

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);

const activeSession = computed(() => sidebarRef.value?.activeSession);

const drawerForm = createProDrawerForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      await updateAssistant(assistantId.value, values);
      window.$message.success('更新成功');
      drawerForm.close();
    } finally {
      loading.value = false;
    }
  },
});

const openSettings = async () => {
  loading.value = true;
  try {
    const { data } = await getAssistantDetail(assistantId.value);
    drawerForm.values.value = data;
    drawerForm.open();
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <n-card
    content-style="height: calc(100vh - 85px); display: flex; flex-direction: column;"
  >
    <div v-if="verified" class="h-full flex">
      <ChatSidebar
        ref="sidebarRef"
        v-model:active-id="activeId"
        :assistant-id="assistantId"
      >
        <template #footer>
          <n-button block class="mt-2" @click="openSettings()">
            {{ $t('page.assistant.chat.settings', '聊天设置') }}
          </n-button>
        </template>
      </ChatSidebar>

      <div class="min-w-0 flex flex-1 flex-col">
        <div
          class="shrink-0 flex items-center justify-between border-b border-[var(--n-border-color)] px-4 pb-3"
        >
          <span class="truncate text-base font-medium">
            {{ activeSession?.name || '' }}
          </span>
        </div>

        <div class="min-h-0 flex-1 px-4">
          <div class="mx-auto h-full max-w-4xl">
            <ChatPanel
              :assistant-id="assistantId"
              :session-id="activeId"
              :messages="activeSession?.messages || []"
            />
          </div>
        </div>
      </div>
    </div>

    <pro-drawer-form :form="drawerForm" :loading="loading">
      <pro-drawer-content
        :title="$t('page.assistant.editAssistant')"
        :native-scrollbar="false"
      >
        <pro-input :title="$t('page.assistant.name')" path="name" required />
        <pro-textarea
          :title="$t('page.assistant.description')"
          path="description"
        />
        <pro-textarea
          :title="$t('page.assistant.empty_response')"
          :tooltip="$t('page.assistant.empty_response_desc')"
          path="emptyResponse"
        />
        <pro-textarea
          :title="$t('page.assistant.opener')"
          :tooltip="$t('page.assistant.opener_desc')"
          path="opener"
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
          :title="$t('page.assistant.prompt')"
          :tooltip="$t('page.assistant.prompt_desc')"
          path="prompt"
        />
        <pro-digit
          :title="$t('page.assistant.similarity_threshold')"
          :tooltip="$t('page.assistant.similarity_threshold_desc')"
          path="similarityThreshold"
        />
        <pro-digit
          :title="$t('page.assistant.vector_similarity_weight')"
          :tooltip="$t('page.assistant.vector_similarity_weight_desc')"
          path="keywordsSimilarityWeight"
        />
        <pro-digit
          :title="$t('page.assistant.top_n')"
          :tooltip="$t('page.assistant.top_n_desc')"
          path="topN"
        />
        <pro-select
          :title="$t('page.assistant.rerank_id')"
          :tooltip="$t('page.assistant.rerank_id_desc')"
          path="rerankId"
          :field-props="{
            options: rerankOptions,
            loading: rerankLoading,
            clearable: true,
            placeholder: '不启用重排序',
          }"
        />
        <pro-digit
          :title="$t('page.assistant.top_p')"
          :tooltip="$t('page.assistant.top_p_desc')"
          path="topP"
        />
        <pro-digit
          :title="$t('page.assistant.temperature')"
          :tooltip="$t('page.assistant.temperature_desc')"
          path="temperature"
        />
      </pro-drawer-content>
    </pro-drawer-form>
  </n-card>
</template>
