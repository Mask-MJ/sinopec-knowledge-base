<script setup lang="ts">
defineProps<{
  /** 模块简述 */
  description?: string;
  /** 模块名称 */
  module: string;
}>();
</script>

<template>
  <div class="flex-col-center min-h-[60vh]">
    <NResult
      status="info"
      :title="module"
      :description="description ?? '该功能正在开发中，敬请期待...'"
    />
  </div>
</template>
