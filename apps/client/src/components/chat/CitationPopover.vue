<script setup lang="ts">
import type { Reference } from '@/composables';

const props = defineProps<{
  index: number;
  reference?: Reference;
  x: number;
  y: number;
}>();

defineEmits<{ close: [] }>();

const chunk = computed(() => props.reference?.chunks[props.index]);
</script>

<template>
  <n-popover
    :show="true"
    :x="x"
    :y="y"
    trigger="manual"
    placement="top"
    style="max-width: 360px"
    @clickoutside="$emit('close')"
  >
    <div v-if="chunk" class="citation-detail">
      <div class="mb-1.5 flex items-center gap-1.5">
        <i class="i-ant-design:file-text-outlined text-sm opacity-60"></i>
        <span class="text-sm font-medium">{{ chunk.document_name }}</span>
      </div>

      <div class="mb-2 text-xs opacity-50">
        {{ $t('page.assistant.chat.similarity', '相似度') }}:
        {{ (chunk.similarity * 100).toFixed(1) }}%
      </div>

      <n-ellipsis
        :line-clamp="4"
        :tooltip="false"
        class="text-sm leading-relaxed"
      >
        {{ chunk.content }}
      </n-ellipsis>
    </div>

    <div v-else class="text-sm opacity-50">
      {{ $t('page.assistant.chat.referenceLoading', '引用加载中...') }}
    </div>
  </n-popover>
</template>
