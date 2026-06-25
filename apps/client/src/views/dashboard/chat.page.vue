<script setup lang="ts">
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

// 通用聊天的模型选项 = 后端预建的全局助手记录 id（每个助手的 RAGFlow chat
// 绑定不同的 llm_id，切换下拉即切换后端助手 → 切换模型）。
// ponytail: 写死全局助手 id，沿用线上既有做法。普通用户的 findAll 只返回自己的
//   助手，取不到这些全局共享助手，所以无法动态拉列表，只能写死。
//   新增一个模型 = 后端建一条助手记录后，把 { label, value: 新id } 加到这里。
const REPORT_AGENT_ASSISTANT_ID = 12; // kb 库「agent」助手 id（RAGFlow chat 绑定 production-report-agent）

const MODEL_OPTIONS = [
  { label: 'DeepSeek', value: 1 },
  { label: '长城大模型', value: 2 },
  { label: 'agent', value: REPORT_AGENT_ASSISTANT_ID },
].filter((o) => o.value > 0); // 未配置（id<=0）的选项不渲染，避免选中后 500

const assistantId = ref<number>(MODEL_OPTIONS[0]?.value ?? 0);
const activeId = ref<string>();

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);
const activeSession = computed(() => sidebarRef.value?.activeSession);
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
            :options="MODEL_OPTIONS"
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
