<script setup lang="ts">
defineProps<{
  hasSession: boolean;
}>();

const emit = defineEmits<{
  selectPrompt: [text: string];
}>();

const suggestedPrompts = [
  '帮我总结一下最新的安全规范要点',
  '如何进行设备巡检？有哪些标准流程？',
  '请解释一下化工生产中的风险等级划分',
  '最新的环保法规对我们有什么影响？',
];
</script>

<template>
  <div class="flex-col-center h-full select-none gap-6 py-12">
    <!-- Icon -->
    <div class="ai-icon-wrapper flex-center h-16 w-16 rounded-2xl">
      <n-icon size="32" color="#fff">
        <i class="i-ant-design:robot-outlined"></i>
      </n-icon>
    </div>

    <!-- With session: show prompts -->
    <div v-if="hasSession" class="text-center">
      <p class="mb-1 text-lg font-medium">
        {{ $t('page.assistant.chat.welcomeTitle', '有什么可以帮到你？') }}
      </p>
      <p class="mb-6 text-sm opacity-50">
        {{
          $t(
            'page.assistant.chat.welcomeHint',
            '选择一个问题开始对话，或直接输入',
          )
        }}
      </p>

      <!-- Prompt suggestion cards -->
      <div class="mx-auto grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          v-for="(prompt, idx) in suggestedPrompts"
          :key="idx"
          class="prompt-card cursor-pointer rounded-lg border border-[var(--n-border-color)] px-3 py-2.5 text-left text-sm leading-relaxed transition-all duration-150"
          @click="emit('selectPrompt', prompt)"
        >
          {{ prompt }}
        </div>
      </div>
    </div>

    <!-- No session -->
    <div v-else class="text-center">
      <p class="mb-1 text-lg font-medium">
        {{ $t('page.assistant.chat.noSession', '暂无会话') }}
      </p>
      <p class="text-sm opacity-50">
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

<style scoped>
.ai-icon-wrapper {
  background: linear-gradient(
    135deg,
    rgb(var(--primary-color)) 0%,
    rgb(var(--primary-400-color)) 100%
  );
}

.prompt-card:hover {
  background: rgba(var(--primary-color), 0.06);
  border-color: rgb(var(--primary-color));
}

:root.dark .prompt-card:hover,
html.dark .prompt-card:hover {
  background: rgba(var(--primary-color), 0.1);
}
</style>
