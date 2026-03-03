<script setup lang="ts">
definePage({
  meta: {
    title: 'monitor.info.title',
    type: 'menu',
  },
});
</script>

<template>
  <div class="p-4">
    <UnderConstruction
      module="服务器监控"
      description="CPU、内存、磁盘等服务器运行状态实时监控"
    />
  </div>
</template>
