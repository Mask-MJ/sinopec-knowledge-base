<script setup lang="ts">
import { useChat } from '@/composables';

import ChatEmptyState from './ChatEmptyState.vue';
import ChatMessageList from './ChatMessageList.vue';
import ChatSender from './ChatSender.vue';

const props = defineProps<{
  assistantId: number;
  messages: ReadonlyArray<{ content?: string; role: string }>;
  sessionId: string | undefined;
}>();

const userStore = useUserStore();

const senderValue = ref('');
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

const assistantIdRef = computed(() => props.assistantId);
const sessionIdRef = computed(() => props.sessionId);

const {
  messages: chatMessages,
  sending,
  send,
  initMessages,
} = useChat(assistantIdRef, sessionIdRef);

const avatar = computed(() => userStore.userInfo?.avatar);

// Sync history messages from parent
watch(
  () => props.messages,
  (history) => initMessages(history),
  { immediate: true },
);

// Auto-scroll on new messages
watch(
  () => chatMessages.value.length,
  () => messageListRef.value?.scrollToBottom(),
);

// Also scroll when streaming content updates
watch(
  () => chatMessages.value[chatMessages.value.length - 1]?.content,
  () => messageListRef.value?.scrollToBottom(),
);

async function handleSend() {
  if (!senderValue.value.trim()) return;
  const question = senderValue.value;
  senderValue.value = '';
  await send(question);
}

function handleSelectPrompt(text: string) {
  senderValue.value = text;
  handleSend();
}
</script>

<template>
  <div class="flex h-full w-full flex-col">
    <!-- Messages area -->
    <div class="min-h-0 flex-1">
      <ChatEmptyState
        v-if="chatMessages.length === 0"
        :has-session="!!sessionId"
        @select-prompt="handleSelectPrompt"
      />
      <ChatMessageList
        v-else
        ref="messageListRef"
        :messages="chatMessages"
        :avatar="avatar"
        class="h-full"
      />
    </div>

    <!-- Input area -->
    <ChatSender
      v-model="senderValue"
      :disabled="!sessionId"
      :loading="sending"
      @submit="handleSend"
    >
      <template #prefix>
        <slot name="sender-prefix"></slot>
      </template>
    </ChatSender>
  </div>
</template>
