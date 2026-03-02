<script setup lang="ts">
import { NLayout, NLayoutContent } from 'naive-ui';
import { RouterView } from 'vue-router';
</script>

<template>
  <NLayout class="wh-full">
    <NLayoutContent class="p-4">
      <RouterView />
    </NLayoutContent>
  </NLayout>
</template>
