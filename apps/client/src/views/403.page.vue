<script setup lang="ts">
definePage({
  meta: {
    ignoreAccess: true,
    title: '403',
    type: 'menu',
  },
});
</script>

<template>
  <Fallback status="403" />
</template>
