<script setup lang="ts">
import type { ChatMessageFile, Reference } from '@/composables';

import { useChat } from '@/composables';
import {
  ATTACHMENT_ACCEPT,
  attachmentError,
  MAX_ATTACHMENTS_PER_TURN,
} from '@/utils/chat-attachment';

import ChatEmptyState from './ChatEmptyState.vue';
import ChatMessageList from './ChatMessageList.vue';
import ChatSender from './ChatSender.vue';

const props = defineProps<{
  /** 允许随提问上传附件（目前只有物探智问开启） */
  allowAttachments?: boolean;
  assistantId: number;
  messages: ReadonlyArray<{
    content?: string;
    files?: ReadonlyArray<ChatMessageFile>;
    reference?: Reference;
    role: string;
  }>;
  sessionId: string | undefined;
}>();

const userStore = useUserStore();

const senderValue = ref('');
const attachedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

const assistantIdRef = computed(() => props.assistantId);
const sessionIdRef = computed(() => props.sessionId);

const {
  messages: chatMessages,
  sending,
  send,
  initMessages,
} = useChat(assistantIdRef, sessionIdRef);

// 当前会话的实时消息（含本次新发的问答），供导出使用
defineExpose({ messages: chatMessages });

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

// 附件是按会话上传的，换会话就清掉还没发出的附件
watch(
  () => props.sessionId,
  () => {
    attachedFiles.value = [];
  },
);

function handleFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = [...(input.files ?? [])];
  // 清空后同一个文件删掉还能再选
  input.value = '';

  const accepted = picked.filter((file) => {
    const error = attachmentError(file);
    if (error) window.$message.warning(error);
    return !error;
  });
  const room = MAX_ATTACHMENTS_PER_TURN - attachedFiles.value.length;
  if (accepted.length > room) {
    window.$message.warning(
      `每次提问最多附带 ${MAX_ATTACHMENTS_PER_TURN} 个文件`,
    );
  }
  attachedFiles.value = [...attachedFiles.value, ...accepted.slice(0, room)];
}

function removeFile(index: number) {
  attachedFiles.value = attachedFiles.value.filter((_, i) => i !== index);
}

async function handleSend() {
  if (!senderValue.value.trim()) return;
  const question = senderValue.value;
  const files = attachedFiles.value;
  senderValue.value = '';
  attachedFiles.value = [];
  const sent = await send(question, files);
  // 附件上传失败没发出去：把问题和附件放回去，免得用户重选
  if (!sent && files.length > 0) {
    senderValue.value = question;
    attachedFiles.value = files;
  }
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
        <div
          v-if="allowAttachments"
          class="flex flex-wrap items-center gap-2"
          :class="{ 'mb-2': $slots['sender-prefix'] }"
        >
          <n-button
            size="small"
            quaternary
            :disabled="
              !sessionId ||
              sending ||
              attachedFiles.length >= MAX_ATTACHMENTS_PER_TURN
            "
            @click="fileInputRef?.click()"
          >
            <template #icon>
              <i class="i-ant-design:paper-clip-outlined"></i>
            </template>
            {{ $t('page.assistant.chat.addAttachment', '添加附件') }}
          </n-button>
          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden"
            :accept="ATTACHMENT_ACCEPT"
            @change="handleFilesPicked"
          />
          <n-tag
            v-for="(file, index) in attachedFiles"
            :key="`${index}-${file.name}`"
            size="small"
            closable
            @close="removeFile(index)"
          >
            {{ file.name }}
          </n-tag>
          <span v-if="attachedFiles.length > 0" class="text-xs opacity-60">
            {{
              $t(
                'page.assistant.chat.attachmentHint',
                '附件仅用于本次提问，追问请重新附上',
              )
            }}
          </span>
        </div>
        <slot name="sender-prefix"></slot>
      </template>
    </ChatSender>
  </div>
</template>
