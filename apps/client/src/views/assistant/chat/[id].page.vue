<script setup lang="ts">
import { createProDrawerForm } from 'pro-naive-ui';

import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

const router = useRouter();
const loading = ref(false);
const activeId = ref<string>();

const assistantId = computed(() => {
  const id = Number(router.currentRoute.value.params.id);
  return Number.isFinite(id) && id > 0 ? id : 0;
});

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);

const activeSession = computed(() => sidebarRef.value?.activeSession);

const drawerForm = createProDrawerForm({
  onSubmit: async () => {
    window.$message.warning('助手设置更新功能暂未实现');
    drawerForm.close();
  },
});
</script>

<template>
  <n-card content-style="height: calc(100vh - 85px)">
    <div class="h-full flex">
      <ChatSidebar
        ref="sidebarRef"
        v-model:active-id="activeId"
        :assistant-id="assistantId"
      >
        <template #footer>
          <n-button block class="mt-2" @click="drawerForm.open()">
            {{ $t('page.assistant.chat.settings', '聊天设置') }}
          </n-button>
        </template>
      </ChatSidebar>

      <div class="min-w-0 flex flex-1 flex-col">
        <div
          class="shrink-0 flex items-center justify-between border-b border-gray-200/60 px-4 pb-3 dark:border-gray-700/40"
        >
          <span class="truncate text-base font-medium">
            {{ activeSession?.name || '' }}
          </span>
        </div>

        <div class="min-h-0 flex-1 px-4">
          <ChatPanel
            :assistant-id="assistantId"
            :session-id="activeId"
            :messages="activeSession?.messages || []"
          />
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
          path="empty_response"
        />
        <pro-textarea
          :title="$t('page.assistant.opener')"
          :tooltip="$t('page.assistant.opener_desc')"
          path="opener"
        />
        <pro-radio-group
          :title="$t('page.assistant.show_quote')"
          path="show_quote"
          :tooltip="$t('page.assistant.show_quote_desc')"
          :field-props="{
            type: 'button',
            options: [
              { label: $t('common.enable'), value: true },
              { label: $t('common.disable'), value: false },
            ],
          }"
        />
        <pro-select
          :title="$t('page.assistant.knowledgeBase')"
          path="knowledgeBase"
          :field-props="{
            options: [
              { label: '知识库 1', value: '1' },
              { label: '知识库 2', value: '2' },
            ],
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
          path="similarity_threshold"
        />
        <pro-digit
          :title="$t('page.assistant.vector_similarity_weight')"
          :tooltip="$t('page.assistant.vector_similarity_weight_desc')"
          path="vector_similarity_weight"
        />
        <pro-digit
          :title="$t('page.assistant.top_n')"
          :tooltip="$t('page.assistant.top_n_desc')"
          path="top_n"
        />
        <pro-digit
          :title="$t('page.assistant.top_p')"
          :tooltip="$t('page.assistant.top_p_desc')"
          path="top_p"
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
