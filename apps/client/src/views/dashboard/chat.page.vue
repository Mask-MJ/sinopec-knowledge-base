<script setup lang="ts">
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

const activeId = ref<string>();
// TODO: 从 API 动态获取可用助手列表，当前使用默认 ID
const DEFAULT_ASSISTANT_ID = 1;
const assistantId = ref(DEFAULT_ASSISTANT_ID);

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);

const activeSession = computed(() => sidebarRef.value?.activeSession);
</script>

<template>
  <n-card content-style="height: calc(100vh - 85px)">
    <div class="h-full flex">
      <ChatSidebar
        ref="sidebarRef"
        v-model:active-id="activeId"
        :assistant-id="assistantId"
      />

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
          >
            <template #sender-prefix>
              <div class="flex items-center gap-2">
                <n-button v-if="assistantId === 1" round size="small">
                  <template #icon>
                    <i class="i-ant-design:global-outlined"></i>
                  </template>
                  <span>联网查询</span>
                </n-button>

                <n-button v-if="assistantId === 1" round size="small">
                  <template #icon>
                    <i class="i-ant-design:node-index-outlined"></i>
                  </template>
                  <span>深度思考</span>
                </n-button>

                <n-select
                  v-model:value="assistantId"
                  class="w-30"
                  size="small"
                  :options="[
                    { label: 'DeepSeek', value: 1 },
                    { label: '长城大模型', value: 2 },
                  ]"
                />
              </div>
            </template>
          </ChatPanel>
        </div>
      </div>
    </div>
  </n-card>
</template>
