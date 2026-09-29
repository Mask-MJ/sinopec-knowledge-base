<script setup lang="ts">
import { minBy } from 'lodash-es';

import { getAssistantList } from '@/api/assistant';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';
import ExportActions from '@/components/common/ExportActions.vue';
import { $t } from '@/locales';
import { chatToMarkdown } from '@/utils/chat-markdown';

// 物探智问：普通用户的知识库问答，不选助手，直接用当前用户可见的
// 第一个知识库助手（非通用助手）。
const loading = ref(true);
const loadFailed = ref(false);
const assistantId = ref(0);
const activeId = ref<string>();

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);
const panelRef = ref<InstanceType<typeof ChatPanel> | null>(null);
const activeSession = computed(() => sidebarRef.value?.activeSession);
const sessionName = computed(
  () => activeSession.value?.name || $t('page.portal.qa'),
);

onMounted(async () => {
  try {
    const { data } = await getAssistantList({ pageSize: 1000 });
    const knowledgeAssistants = (data?.list ?? []).filter(
      (assistant) => !assistant.isGeneral,
    );
    // 列表接口不保证顺序，取 id 最小的，保证每次进来都是同一个助手
    assistantId.value = minBy(knowledgeAssistants, 'id')?.id ?? 0;
  } catch {
    // 请求层已弹出错误提示，这里只切到失败态
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
});

function getMarkdown() {
  return chatToMarkdown(sessionName.value, panelRef.value?.messages ?? []);
}
</script>

<template>
  <div class="h-full p-4">
    <div v-if="loading" class="h-full flex-center">
      <NSpin />
    </div>

    <div v-else-if="loadFailed || !assistantId" class="h-full flex-center">
      <NEmpty
        :description="
          $t(loadFailed ? 'page.portal.loadFailed' : 'page.portal.noAssistant')
        "
      />
    </div>

    <NCard
      v-else
      class="h-full"
      content-style="height: 100%; display: flex; min-height: 0;"
    >
      <ChatSidebar
        ref="sidebarRef"
        v-model:active-id="activeId"
        :assistant-id="assistantId"
      />

      <div class="min-w-0 flex flex-1 flex-col">
        <div
          class="flex shrink-0 items-center justify-between border-b border-[var(--n-border-color)] px-4 pb-3"
        >
          <span class="truncate text-base font-medium">
            {{ activeSession?.name || '' }}
          </span>
          <ExportActions :filename="sessionName" :get-markdown="getMarkdown" />
        </div>

        <div class="min-h-0 flex-1 px-4">
          <ChatPanel
            ref="panelRef"
            :assistant-id="assistantId"
            :session-id="activeId"
            :messages="activeSession?.messages || []"
          />
        </div>
      </div>
    </NCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: front
  title: page.portal.qa
  hideInTab: true
</route>
