<script setup lang="ts">
import { NButton, NResult } from 'naive-ui';
</script>

<template>
  <div class="flex-col-center min-h-screen">
    <NResult
      status="success"
      title="中石化知识库"
      description="项目已成功初始化，开始构建你的知识管理系统"
    >
      <template #footer>
        <NButton type="primary"> 开始使用 </NButton>
      </template>
    </NResult>
  </div>
</template>
