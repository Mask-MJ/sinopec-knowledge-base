<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const inputValue = defineModel<string>({ default: '' });

function handleKeydown(e: KeyboardEvent) {
  // Enter to send, Shift+Enter for newline
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!props.disabled && !props.loading && inputValue.value.trim()) {
      emit('submit');
    }
  }
}
</script>

<template>
  <div class="chat-sender border-t border-[var(--n-border-color)] pt-3">
    <!-- Prefix slot for extra controls (model selector, etc.) -->
    <div v-if="$slots.prefix" class="mb-2">
      <slot name="prefix"></slot>
    </div>

    <div class="flex items-end gap-2">
      <n-input
        v-model:value="inputValue"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        :disabled="disabled"
        :placeholder="
          disabled
            ? $t('page.assistant.chat.createSessionHint', '请先创建会话')
            : $t(
                'page.assistant.chat.inputPlaceholder',
                '输入消息，Enter 发送，Shift+Enter 换行',
              )
        "
        class="flex-1"
        @keydown="handleKeydown"
      />
      <n-button
        type="primary"
        circle
        :loading="loading"
        :disabled="disabled || !inputValue.trim()"
        aria-label="发送"
        @click="emit('submit')"
      >
        <template v-if="!loading" #icon>
          <i class="i-ant-design:send-outlined"></i>
        </template>
      </n-button>
    </div>
  </div>
</template>
