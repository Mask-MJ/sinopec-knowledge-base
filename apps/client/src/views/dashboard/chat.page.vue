<script setup lang="ts">
import { getOrCreateGeneralAssistant } from '@/api/assistant';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

const activeId = ref<string>();
const assistantId = ref(0);
const ready = ref(false);

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);

const activeSession = computed(() => sidebarRef.value?.activeSession);

onMounted(async () => {
  try {
    const { data } = await getOrCreateGeneralAssistant();
    if (data?.id) {
      assistantId.value = data.id as number;
    }
  } catch {
    window.$message.error('获取通用助手失败');
  }
  ready.value = true;
});
</script>

<template>
  <n-card
    content-style="height: calc(100vh - 85px); display: flex; flex-direction: column;"
  >
    <n-empty
      v-if="ready && !assistantId"
      description="暂无可用的通用助手，请先创建一个不关联知识库的助手"
      class="py-16"
    />

    <div v-else-if="ready" class="h-full flex">
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
