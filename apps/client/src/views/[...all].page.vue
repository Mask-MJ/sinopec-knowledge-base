<script setup lang="ts">
definePage({
  meta: {
    ignoreAccess: true,
    title: '404',
    type: 'menu',
  },
});
</script>

<template>
  <Fallback status="404" />
</template>
