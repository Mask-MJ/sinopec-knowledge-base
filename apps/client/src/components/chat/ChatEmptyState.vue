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
      <p class="mb-1 text-lg font-medium">
        {{ $t('page.assistant.chat.welcomeTitle', '有什么可以帮到你？') }}
      </p>
      <p class="text-sm text-gray-400">
        {{ $t('page.assistant.chat.welcomeHint', '输入问题开始对话') }}
      </p>
    </div>
    <div v-else class="text-center">
      <p class="mb-1 text-lg font-medium">
        {{ $t('page.assistant.chat.noSession', '暂无会话') }}
      </p>
      <p class="text-sm text-gray-400">
        {{
          $t(
            'page.assistant.chat.createSessionHint',
            '点击左侧 + 按钮创建新会话',
          )
        }}
      </p>
    </div>
  </div>
</template>
