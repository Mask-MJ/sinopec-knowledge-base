# Chat UI Refactor — AI-Native Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entire chat feature (composable + ChatPanel + sidebar + two pages) into a clean, AI-Native styled architecture with proper separation of concerns, immutable state, and deduplicated code.

**Architecture:** Extract `useChat` composable for stream/state logic, extract `ChatSidebar` component for session management (eliminating duplication between dashboard and assistant pages), and restyle ChatPanel with AI-Native design tokens using the existing UnoCSS theme system.

**Tech Stack:** Vue 3 Composition API, vue-element-plus-x (BubbleList/Sender/Thinking/XMarkdown/useXStream/Conversations), UnoCSS, Naive UI, @vueuse/core (useDebounceFn), TypeScript

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/client/src/composables/useChat.ts` | Stream handling, message state, think-tag parsing, immutable updates |
| Create | `apps/client/src/components/chat/ChatSidebar.vue` | Session list, search (debounced), add/delete/rename, empty state |
| Create | `apps/client/src/components/chat/ChatEmptyState.vue` | Welcome/empty state when no messages exist |
| Modify | `apps/client/src/components/chat/ChatPanel.vue` | Pure rendering: bubbles, sender, avatar, styles (AI-Native) |
| Modify | `apps/client/src/views/dashboard/chat.page.vue` | Compose ChatSidebar + ChatPanel, model selector |
| Modify | `apps/client/src/views/assistant/chat/[id].page.vue` | Compose ChatSidebar + ChatPanel, settings drawer |
| Modify | `apps/client/src/composables/index.ts` | Re-export useChat |

---

## Task 1: Create `useChat` composable

**Files:**
- Create: `apps/client/src/composables/useChat.ts`
- Modify: `apps/client/src/composables/index.ts`

This is the core logic extraction. It owns: message list state, streaming, think-tag parsing, immutable updates, sending lock.

- [ ] **Step 1: Create the composable file with types and think-tag parser**

```typescript
// apps/client/src/composables/useChat.ts
import type { BubbleProps } from 'vue-element-plus-x/types/Bubble';
import type { ThinkingStatus } from 'vue-element-plus-x/types/Thinking';

import { useXStream } from 'vue-element-plus-x';

import { completions } from '@/api/assistant';

export interface ChatMessage extends BubbleProps {
  collapse?: boolean;
  content?: string;
  key: number;
  reasoning_content?: string;
  role: 'assistant' | 'user';
  thinkingStatus?: ThinkingStatus;
}

interface StreamChunkData {
  answer: string;
}

function isStreamChunkData(data: unknown): data is StreamChunkData {
  return typeof data === 'object' && data !== null && 'answer' in data;
}

function safeJsonParse(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Parse think tags from text. Returns [reasoning, content] tuple.
 */
export function parseThinkContent(text: string): [string, string] {
  const reasoning = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)]
    .map((m) => m[1])
    .join('')
    .trim();
  const content = text.replaceAll(/<think>[\s\S]*?<\/think>/g, '').trim();
  return [reasoning, content];
}
```

- [ ] **Step 2: Add the `useChat` function with message state management**

Append to the same file:

```typescript
export function useChat(
  assistantId: Ref<number>,
  sessionId: Ref<string | undefined>,
) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  let activeAssistantIndex = -1;

  const { startStream, data } = useXStream();

  function initMessages(
    history: ReadonlyArray<{ content?: string; role: string }>,
  ) {
    messages.value = history.map((item, i) => {
      const [reasoning, content] = parseThinkContent(item.content ?? '');
      return {
        key: i,
        role: item.role as 'assistant' | 'user',
        content,
        reasoning_content: reasoning,
        placement: (item.role === 'assistant' ? 'start' : 'end') as
          | 'end'
          | 'start',
        avatarSize: '32px',
        avatarGap: '12px',
        isMarkdown: item.role === 'assistant',
        loading: false,
        thinkingStatus: 'end' as const,
        collapse: false,
      };
    });
    activeAssistantIndex = -1;
  }

  function updateAssistantMessage(patch: Partial<ChatMessage>) {
    if (activeAssistantIndex < 0) return;
    const idx = activeAssistantIndex;
    messages.value = messages.value.map((msg, i) =>
      i === idx ? { ...msg, ...patch } : msg,
    );
  }

  async function send(question: string) {
    if (!sessionId.value || sending.value || !question.trim()) return;
    sending.value = true;

    const userMsg: ChatMessage = {
      key: messages.value.length,
      role: 'user',
      content: question,
      reasoning_content: '',
      placement: 'end',
      avatarSize: '32px',
      avatarGap: '12px',
      isMarkdown: false,
      loading: false,
      thinkingStatus: 'end',
      collapse: false,
    };
    const assistantMsg: ChatMessage = {
      key: messages.value.length + 1,
      role: 'assistant',
      content: '',
      reasoning_content: '',
      placement: 'start',
      avatarSize: '32px',
      avatarGap: '12px',
      isMarkdown: true,
      loading: true,
      thinkingStatus: 'start',
      collapse: false,
    };
    messages.value = [...messages.value, userMsg, assistantMsg];
    activeAssistantIndex = messages.value.length - 1;

    try {
      const { response } = await completions(assistantId.value, {
        stream: true,
        sessionId: sessionId.value,
        question,
      });
      if (!response.body) throw new Error('响应体为空');
      await startStream({ readableStream: response.body });
    } catch {
      updateAssistantMessage({
        content: '请求失败，请重试',
        loading: false,
        thinkingStatus: 'end',
      });
      window.$message.error('发送消息失败，请重试');
    } finally {
      sending.value = false;
    }
  }

  watch(
    data,
    (chunks) => {
      if (!chunks.length || activeAssistantIndex < 0) return;

      const lastRaw = safeJsonParse(chunks[chunks.length - 1]?.data) as Record<
        string,
        unknown
      > | null;
      if (!lastRaw) return;

      const payload = lastRaw.data;

      // Stream end signal: data === true
      if (payload === true) {
        const prev =
          chunks.length >= 2
            ? (safeJsonParse(chunks[chunks.length - 2]?.data) as Record<
                string,
                unknown
              > | null)
            : null;
        const prevPayload = prev?.data;
        const text = isStreamChunkData(prevPayload) ? prevPayload.answer : '';
        const [reasoning, content] = parseThinkContent(text);
        updateAssistantMessage({
          content,
          reasoning_content: reasoning,
          loading: false,
          thinkingStatus: 'end',
          collapse: false,
        });
        return;
      }

      // Normal chunk
      if (isStreamChunkData(payload)) {
        const [reasoning, content] = parseThinkContent(payload.answer);
        updateAssistantMessage({
          content,
          reasoning_content: reasoning,
          loading: true,
          thinkingStatus: 'thinking',
          collapse: true,
        });
      }
    },
    { deep: true },
  );

  return {
    messages: readonly(messages),
    sending: readonly(sending),
    send,
    initMessages,
  };
}
```

- [ ] **Step 3: Re-export from composables index**

Add to `apps/client/src/composables/index.ts`:

```typescript
export { parseThinkContent, useChat } from '@/composables/useChat';
export type { ChatMessage } from '@/composables/useChat';
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm -F @sinopec-kb/client vue-tsc --noEmit`

Expected: No type errors related to useChat.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/composables/useChat.ts apps/client/src/composables/index.ts
git commit -m "feat(client): extract useChat composable with immutable state and type-safe streaming"
```

---

## Task 2: Create `ChatEmptyState` component

**Files:**
- Create: `apps/client/src/components/chat/ChatEmptyState.vue`

Simple component shown when there are no messages in the current session.

- [ ] **Step 1: Create the empty state component**

```vue
<!-- apps/client/src/components/chat/ChatEmptyState.vue -->
<script setup lang="ts">
defineProps<{
  hasSession: boolean;
}>();
</script>

<template>
  <div class="flex-col-center h-full select-none gap-4 py-12 opacity-60">
    <n-icon size="48" class="opacity-40">
      <i class="i-ant-design:robot-outlined"></i>
    </n-icon>
    <div v-if="hasSession" class="text-center">
      <p class="mb-1 text-lg font-medium">{{ $t('page.assistant.chat.welcomeTitle', '有什么可以帮到你？') }}</p>
      <p class="text-sm text-gray-400">{{ $t('page.assistant.chat.welcomeHint', '输入问题开始对话') }}</p>
    </div>
    <div v-else class="text-center">
      <p class="mb-1 text-lg font-medium">{{ $t('page.assistant.chat.noSession', '暂无会话') }}</p>
      <p class="text-sm text-gray-400">{{ $t('page.assistant.chat.createSessionHint', '点击左侧 + 按钮创建新会话') }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/chat/ChatEmptyState.vue
git commit -m "feat(client): add ChatEmptyState component for empty/welcome state"
```

---

## Task 3: Create `ChatSidebar` component (deduplicate sidebar logic)

**Files:**
- Create: `apps/client/src/components/chat/ChatSidebar.vue`

Extracts the duplicated sidebar from both pages. Owns: session CRUD, search with debounce, rename modal, empty state.

- [ ] **Step 1: Create the sidebar component**

```vue
<!-- apps/client/src/components/chat/ChatSidebar.vue -->
<script setup lang="ts">
import type { SessionInfo } from '@/api/assistant';
import type {
  ConversationItem,
  ConversationMenuCommand,
} from 'vue-element-plus-x/types/Conversations';

import { find } from 'lodash-es';
import { useDebounceFn } from '@vueuse/core';
import { createProModalForm } from 'pro-naive-ui';
import { Conversations } from 'vue-element-plus-x';

import {
  createChatSession,
  deleteChatSession,
  getChatSessionList,
  updateChatSession,
} from '@/api/assistant';

const props = defineProps<{
  assistantId: number;
}>();

const activeId = defineModel<string | undefined>('activeId');

const loading = ref(false);
const searchName = ref('');
const sessionList = ref<SessionInfo[]>([]);
const collapsed = ref(false);

const activeSession = computed(() =>
  find(sessionList.value, (item) => item.id === activeId.value),
);

defineExpose({ activeSession });

const modalForm = createProModalForm({
  onSubmit: async (values) => {
    if (!activeSession.value) return;
    loading.value = true;
    try {
      await updateChatSession(props.assistantId, values.id, values);
      await fetchSessions();
    } finally {
      modalForm.close();
      loading.value = false;
    }
  },
});

async function handleMenuCommand(
  command: ConversationMenuCommand,
  item: ConversationItem,
) {
  if (command === 'delete') {
    await deleteChatSession(props.assistantId, item.id);
    window.$message.success('删除成功');
    // If deleted item was active, clear selection
    if (activeId.value === item.id) {
      activeId.value = undefined;
    }
    await fetchSessions();
  }
  if (command === 'rename') {
    modalForm.values.value = { id: item.id, name: item.label };
    modalForm.show.value = true;
  }
}

async function addSession() {
  const { data } = await createChatSession(props.assistantId, {
    name: '新会话',
  });
  if (data) {
    sessionList.value = [data, ...sessionList.value];
    activeId.value = data.id;
  }
}

async function fetchSessions() {
  const { data = [] } = await getChatSessionList(props.assistantId, {
    name: searchName.value || undefined,
  });
  sessionList.value = data;
  // Auto-select first if nothing active
  if (sessionList.value.length > 0 && !activeId.value) {
    activeId.value = sessionList.value[0]?.id;
  }
}

const debouncedFetch = useDebounceFn(fetchSessions, 300);

watch(searchName, () => debouncedFetch());
watch(() => props.assistantId, () => {
  activeId.value = undefined;
  fetchSessions();
}, { immediate: true });
</script>

<template>
  <div
    class="chat-sidebar flex flex-col overflow-hidden border-r border-gray-200/60 transition-all duration-250 ease-out dark:border-gray-700/40"
    :class="collapsed ? 'w-0 p-0' : 'w-72 pr-4'"
  >
    <div class="mb-3 flex items-center justify-between py-2">
      <span class="text-base font-semibold">{{ $t('page.assistant.chat.conversations', '会话列表') }}</span>
      <div class="flex gap-1">
        <n-tooltip>
          <template #trigger>
            <n-button quaternary size="small" circle @click="addSession">
              <template #icon>
                <i class="i-ant-design:plus-outlined"></i>
              </template>
            </n-button>
          </template>
          {{ $t('page.assistant.chat.newSession', '新建会话') }}
        </n-tooltip>
        <n-tooltip>
          <template #trigger>
            <n-button quaternary size="small" circle @click="collapsed = !collapsed">
              <template #icon>
                <i class="i-ant-design:menu-fold-outlined"></i>
              </template>
            </n-button>
          </template>
          {{ $t('page.assistant.chat.collapseSidebar', '收起侧边栏') }}
        </n-tooltip>
      </div>
    </div>

    <n-input
      v-model:value="searchName"
      class="mb-3"
      clearable
      :placeholder="$t('page.assistant.chat.searchPlaceholder', '搜索会话...')"
      size="small"
    >
      <template #prefix>
        <i class="i-ant-design:search-outlined opacity-40"></i>
      </template>
    </n-input>

    <div v-if="sessionList.length === 0" class="flex-col-center gap-2 py-8 opacity-50">
      <i class="i-ant-design:inbox-outlined text-3xl"></i>
      <span class="text-sm">{{ $t('page.assistant.chat.noSessions', '暂无会话') }}</span>
      <n-button size="small" type="primary" ghost @click="addSession">
        {{ $t('page.assistant.chat.createFirst', '创建第一个会话') }}
      </n-button>
    </div>

    <Conversations
      v-else
      v-model:active="activeId"
      class="flex-1 overflow-y-auto"
      :items="sessionList"
      :label-max-width="180"
      :show-tooltip="true"
      label-key="name"
      tooltip-placement="right"
      :tooltip-offset="35"
      show-to-top-btn
      show-built-in-menu
      @menu-command="handleMenuCommand"
    />

    <slot name="footer"></slot>

    <!-- Rename Modal -->
    <pro-modal-form
      :title="$t('page.assistant.chat.rename', '重命名')"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input v-show="false" path="id" required />
      <pro-input
        :title="$t('page.assistant.chat.newName', '新名称')"
        path="name"
        required
      />
    </pro-modal-form>
  </div>

  <!-- Expand button when collapsed -->
  <n-tooltip v-if="collapsed" placement="right">
    <template #trigger>
      <n-button
        class="mr-2 self-start"
        quaternary
        size="small"
        circle
        @click="collapsed = false"
      >
        <template #icon>
          <i class="i-ant-design:menu-unfold-outlined"></i>
        </template>
      </n-button>
    </template>
    {{ $t('page.assistant.chat.expandSidebar', '展开侧边栏') }}
  </n-tooltip>
</template>

<style scoped>
.chat-sidebar {
  min-width: 0;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/chat/ChatSidebar.vue
git commit -m "feat(client): extract ChatSidebar component with debounced search and empty state"
```

---

## Task 4: Refactor `ChatPanel.vue` — AI-Native styling + use composable

**Files:**
- Modify: `apps/client/src/components/chat/ChatPanel.vue`

Strip all logic into `useChat`, make it a pure rendering component with AI-Native styling.

- [ ] **Step 1: Rewrite ChatPanel.vue**

```vue
<!-- apps/client/src/components/chat/ChatPanel.vue -->
<script setup lang="ts">
import type { BubbleListInstance } from 'vue-element-plus-x/types/BubbleList';

import { BubbleList, Sender, Thinking, XMarkdown } from 'vue-element-plus-x';

import { useChat } from '@/composables';
import logoUrl from '@/assets/logo.png';
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

const { messages: bubbleItems, sending, send, initMessages } = useChat(
  assistantIdRef,
  sessionIdRef,
);

const avatar = computed(() => userStore.userInfo?.avatar || logoUrl);

// Sync history messages from parent
watch(
  () => props.messages,
  (history) => initMessages(history),
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
  <div class="chat-panel flex flex-col h-full w-full">
    <!-- Messages area -->
    <div class="flex-1 min-h-0">
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
            v-model="item.collapse"
            :content="item.reasoning_content"
            :status="item.thinkingStatus"
            class="thinking-block mb-2!"
            max-width="100%"
          />
        </template>

        <!-- Content -->
        <template #content="{ item }">
          <XMarkdown
            v-if="item.content && item.role === 'assistant'"
            :markdown="item.content"
            class="w-full"
          />
          <div
            v-if="item.content && item.role === 'user'"
            class="user-content"
          >
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
    border-radius: 4px 16px 16px 16px;
    border: 1px solid rgba(0, 0, 0, 0.04);
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
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm -F @sinopec-kb/client vue-tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/chat/ChatPanel.vue apps/client/src/components/chat/ChatEmptyState.vue
git commit -m "feat(client): refactor ChatPanel to AI-Native style with useChat composable"
```

---

## Task 5: Refactor `dashboard/chat.page.vue` — use ChatSidebar + ChatPanel

**Files:**
- Modify: `apps/client/src/views/dashboard/chat.page.vue`

Remove all duplicated sidebar logic, use ChatSidebar component.

- [ ] **Step 1: Rewrite dashboard chat page**

```vue
<!-- apps/client/src/views/dashboard/chat.page.vue -->
<script setup lang="ts">
import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

const activeId = ref<string>();
const assistantId = ref(1);

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

      <div class="flex-1 min-w-0 flex flex-col">
        <div class="shrink-0 flex items-center justify-between border-b border-gray-200/60 px-4 pb-3 dark:border-gray-700/40">
          <span class="text-base font-medium truncate">
            {{ activeSession?.name || '' }}
          </span>
        </div>

        <div class="flex-1 min-h-0 px-4">
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/views/dashboard/chat.page.vue
git commit -m "refactor(client): dashboard chat page uses ChatSidebar, removes duplicated logic"
```

---

## Task 6: Refactor `assistant/chat/[id].page.vue` — use ChatSidebar + ChatPanel

**Files:**
- Modify: `apps/client/src/views/assistant/chat/[id].page.vue`

Same deduplication. This page keeps the settings drawer which is unique to it.

- [ ] **Step 1: Rewrite assistant chat page**

```vue
<!-- apps/client/src/views/assistant/chat/[id].page.vue -->
<script setup lang="ts">
import { createProDrawerForm } from 'pro-naive-ui';

import ChatPanel from '@/components/chat/ChatPanel.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';

const router = useRouter();
const loading = ref(false);
const activeId = ref<string>();

const assistantId = computed(() => {
  const params = router.currentRoute.value.params as { id: string };
  return Number(params.id);
});

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null);

const activeSession = computed(() => sidebarRef.value?.activeSession);

const drawerForm = createProDrawerForm({
  onSubmit: async (values) => {
    loading.value = true;
    // TODO: implement assistant settings update
    console.warn('submit', values);
    drawerForm.close();
    loading.value = false;
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

      <div class="flex-1 min-w-0 flex flex-col">
        <div class="shrink-0 flex items-center justify-between border-b border-gray-200/60 px-4 pb-3 dark:border-gray-700/40">
          <span class="text-base font-medium truncate">
            {{ activeSession?.name || '' }}
          </span>
        </div>

        <div class="flex-1 min-h-0 px-4">
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
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm -F @sinopec-kb/client vue-tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/views/assistant/chat/[id].page.vue
git commit -m "refactor(client): assistant chat page uses ChatSidebar, removes duplicated logic"
```

---

## Task 7: Final verification

**Files:** All modified files

- [ ] **Step 1: Run lint**

Run: `pnpm -F @sinopec-kb/client lint`

Expected: No errors (warnings acceptable).

- [ ] **Step 2: Run typecheck**

Run: `pnpm check:type`

Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `pnpm -F @sinopec-kb/client build`

Expected: Build succeeds.

- [ ] **Step 4: Final commit (if any lint fixes)**

```bash
git add -u
git commit -m "chore(client): lint fixes after chat UI refactor"
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| Stream logic in ChatPanel (mutable push + index mutation) | `useChat` composable (immutable, explicit cursor, type-guarded) |
| Think-tag parsing: 2 functions, regex exec loop | `parseThinkContent`: single function, returns `[reasoning, content]` tuple |
| Sidebar duplicated in 2 pages (~80 lines each) | `ChatSidebar` component, used by both pages |
| Search triggers API on every keystroke | `useDebounceFn(fetchSessions, 300)` |
| No empty/welcome state | `ChatEmptyState` component |
| `absolute bottom-0` Sender overlapping content | Flex layout: `flex-1 min-h-0` + `shrink-0` |
| `max-height: calc(100vh - 360px)` hardcoded | BubbleList fills available flex space |
| AI/user bubbles look the same | AI-Native design: differentiated colors, rounded corners, accent gradient avatar |
| Thinking block plain | Left-border accent + subtle background tint |
| Fixed sidebar width, no collapse | Collapsible sidebar with smooth transition |
| `watchEffect` causing unnecessary refetches | Explicit `watch` on `assistantId` + debounced search |
