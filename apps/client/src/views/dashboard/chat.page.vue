<script setup lang="ts">
import type { AssistantInfo } from '@/api/assistant';

import { getAssistantList, getOrCreateGeneralAssistant } from '@/api/assistant';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

// 通用聊天的可选助手 = 当前用户可见的助手列表（每个助手的 RAGFlow chat 绑定不同
// llm_id，切换下拉即切换后端助手 → 切换模型）。
// 全新环境里 Assistant 表是空的，此时用 POST /assistant/general 幂等创建一个通用
// 助手兜底，避免页面因拿不到助手 id 而直接 404 打不开。
const assistantOptions = ref<{ label: string; value: number }[]>([]);
const assistantId = ref(0);
const activeId = ref<string>();

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);
const activeSession = computed(() => sidebarRef.value?.activeSession);

onMounted(async () => {
  const { data } = await getAssistantList({ pageSize: 1000 });
  let list: AssistantInfo[] = data?.list ?? [];

  if (list.length === 0) {
    const { data: general } = await getOrCreateGeneralAssistant();
    if (general) list = [general];
  }

  assistantOptions.value = list.map(({ id, name }) => ({
    label: name,
    value: id,
  }));
  assistantId.value = assistantOptions.value[0]?.value ?? 0;
});
</script>

<template>
  <n-card
    content-style="height: calc(100vh - 85px); display: flex; flex-direction: column;"
  >
    <div class="h-full flex">
      <ChatSidebar
        ref="sidebarRef"
        v-model:active-id="activeId"
        :assistant-id="assistantId"
      />

      <div class="min-w-0 flex flex-1 flex-col">
        <div
          class="shrink-0 flex items-center justify-between border-b border-[var(--n-border-color)] px-4 pb-3"
        >
          <span class="truncate text-base font-medium">
            {{ activeSession?.name || '' }}
          </span>

          <n-select
            v-model:value="assistantId"
            class="w-36"
            size="small"
            :options="assistantOptions"
          />
        </div>

        <div class="min-h-0 flex-1 px-4">
          <ChatPanel
            :assistant-id="assistantId"
            :session-id="activeId"
            :messages="activeSession?.messages || []"
          >
            <template #sender-prefix>
              <div class="flex items-center gap-2" />
            </template>
          </ChatPanel>
        </div>
      </div>
    </div>
  </n-card>
</template>
