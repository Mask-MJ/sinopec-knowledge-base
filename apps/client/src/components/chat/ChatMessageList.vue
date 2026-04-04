<script setup lang="ts">
import type { ChatMessage } from '@/composables';

import ChatBubble from './ChatBubble.vue';

defineProps<{
  avatar?: string;
  messages: ChatMessage[];
}>();

const containerRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (!containerRef.value) return;
    containerRef.value.scrollTo({
      top: containerRef.value.scrollHeight,
      behavior: 'smooth',
    });
  });
}

defineExpose({ scrollToBottom });
</script>

<template>
  <div
    ref="containerRef"
    role="log"
    aria-live="polite"
    class="flex flex-col gap-5 overflow-y-auto px-2 py-6"
  >
    <ChatBubble
      v-for="msg in messages"
      :key="msg.key"
      :role="msg.role"
      :content="msg.content"
      :reasoning="msg.reasoning"
      :loading="msg.loading"
      :thinking-status="msg.thinkingStatus"
      :avatar="avatar"
    />
  </div>
</template>
