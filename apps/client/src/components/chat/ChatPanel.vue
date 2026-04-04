<script setup lang="ts">
import type { BubbleListInstance } from 'vue-element-plus-x/types/BubbleList';

import { BubbleList, Sender, Thinking, XMarkdown } from 'vue-element-plus-x';

import logoUrl from '@/assets/logo.png';
import { useChat } from '@/composables';

import ChatEmptyState from './ChatEmptyState.vue';

const props = defineProps<{
  assistantId: number;
  messages: ReadonlyArray<{ content?: string; role: string }>;
  sessionId: string | undefined;
}>();

const userStore = useUserStore();

const senderValue = ref('');
const bubbleListRef = ref<BubbleListInstance | null>(null);

const assistantIdRef = computed(() => props.assistantId);
const sessionIdRef = computed(() => props.sessionId);

const {
  messages: bubbleItems,
  sending,
  send,
  initMessages,
} = useChat(assistantIdRef, sessionIdRef);

const avatar = computed(() => userStore.userInfo?.avatar || logoUrl);

// Manage collapse state independently to avoid direct mutation of bubble items
const collapseMap = reactive<Map<number, boolean>>(new Map());

// Sync history messages from parent
watch(
  () => props.messages,
  (history) => {
    collapseMap.clear();
    initMessages(history);
  },
  { immediate: true },
);

// Auto-scroll on new messages
watch(
  () => bubbleItems.value.length,
  () => nextTick(() => bubbleListRef.value?.scrollToBottom()),
);

async function handleSend() {
  if (!senderValue.value.trim()) return;
  const question = senderValue.value;
  senderValue.value = '';
  await send(question);
}
</script>

<template>
  <div class="chat-panel h-full w-full flex flex-col">
    <!-- Messages area -->
    <div class="min-h-0 flex-1">
      <ChatEmptyState
        v-if="bubbleItems.length === 0"
        :has-session="!!sessionId"
      />
      <BubbleList
        v-else
        ref="bubbleListRef"
        class="bubble-list h-full"
        :list="bubbleItems"
      >
        <!-- Avatar -->
        <template #avatar="{ item }">
          <n-avatar
            v-if="item.role === 'assistant'"
            round
            :size="32"
            class="ai-avatar"
          >
            <n-icon size="18">
              <i class="i-ant-design:robot-outlined"></i>
            </n-icon>
          </n-avatar>
          <n-avatar v-else round :size="32" :src="avatar" />
        </template>

        <!-- Thinking block -->
        <template #header="{ item }">
          <Thinking
            v-if="item.reasoning_content"
            :model-value="collapseMap.get(item.key) ?? item.collapse"
            :content="item.reasoning_content"
            :status="item.thinkingStatus"
            class="thinking-block mb-2!"
            max-width="100%"
            @update:model-value="(v: boolean) => collapseMap.set(item.key, v)"
          />
        </template>

        <!-- Content -->
        <template #content="{ item }">
          <XMarkdown
            v-if="item.content && item.role === 'assistant'"
            :markdown="item.content"
            class="w-full"
          />
          <div v-if="item.content && item.role === 'user'" class="user-content">
            {{ item.content }}
          </div>
        </template>
      </BubbleList>
    </div>

    <!-- Input area -->
    <div class="chat-input-area shrink-0 pt-3">
      <Sender
        v-model="senderValue"
        :auto-size="{ maxRows: 6, minRows: 2 }"
        :disabled="!sessionId"
        variant="updown"
        clearable
        allow-speech
        :loading="sending"
        @submit="handleSend"
      >
        <template #prefix>
          <slot name="sender-prefix"></slot>
        </template>
      </Sender>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-panel {
  --ai-accent: #6366f1;
  --ai-bubble-bg: #f9fafb;
  --user-bubble-bg: #e0e7ff;
  --message-gap: 16px;
}

// Dark mode overrides
:root.dark .chat-panel,
html.dark .chat-panel {
  --ai-bubble-bg: #1e1e2e;
  --user-bubble-bg: #2e2e4e;
}

.ai-avatar {
  background: linear-gradient(135deg, var(--ai-accent) 0%, #818cf8 100%);
  color: #fff;
}

:deep() {
  .el-bubble-list {
    padding: 24px 0 8px;
  }

  .el-bubble {
    padding: 0 16px var(--message-gap);
  }

  // AI bubble styling
  .el-bubble[data-placement='start'] .el-bubble-content {
    background: var(--ai-bubble-bg);
    border: 1px solid rgba(0, 0, 0, 0.04);
    border-radius: 4px 16px 16px 16px;
    padding: 2px;
  }

  // User bubble styling
  .el-bubble[data-placement='end'] .el-bubble-content {
    background: var(--user-bubble-bg);
    border-radius: 16px 4px 16px 16px;
    padding: 2px;
  }

  .el-bubble-content {
    max-width: 100% !important;
    transition: background-color 0.2s ease;
  }

  .el-typewriter {
    overflow: hidden;
    border-radius: 12px;
  }

  .user-content {
    white-space: pre-wrap;
    line-height: 1.6;
    padding: 8px 12px;
  }

  .markdown-body {
    background-color: transparent;
    line-height: 1.7;
  }

  .markdown-elxLanguage-header-div {
    top: -25px !important;
  }

  .elx-xmarkdown-container {
    padding: 8px 4px;
  }
}

.thinking-block {
  :deep(.el-thinking) {
    border-left: 3px solid var(--ai-accent);
    border-radius: 0 8px 8px 0;
    background: rgba(99, 102, 241, 0.04);
    padding-left: 12px;
  }
}

.chat-input-area {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 12px;
}

:root.dark .chat-input-area,
html.dark .chat-input-area {
  border-top-color: rgba(255, 255, 255, 0.08);
}
</style>
