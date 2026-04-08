<script setup lang="ts">
import type { Reference } from '@/composables';

defineProps<{
  reference: Reference;
}>();
</script>

<template>
  <div
    v-if="reference.doc_aggs && reference.doc_aggs.length > 0"
    class="reference-source-list mt-3 border-t border-gray-200/50 pt-2.5 dark:border-gray-700/50"
  >
    <div class="mb-1.5 text-xs font-medium opacity-50">
      {{ $t('page.assistant.chat.referenceSources', '参考来源') }}
    </div>
    <div class="flex flex-wrap gap-1.5">
      <n-tag
        v-for="doc in reference.doc_aggs"
        :key="doc.doc_id"
        :bordered="false"
        size="small"
        round
        type="info"
      >
        <template #icon>
          <i class="i-ant-design:file-text-outlined"></i>
        </template>
        {{ doc.doc_name }}
        <span v-if="doc.count > 1" class="ml-0.5 opacity-60">
          ({{ doc.count }})
        </span>
      </n-tag>
    </div>
  </div>
</template>
