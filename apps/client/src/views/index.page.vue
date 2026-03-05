<script setup lang="ts">
definePage({
  meta: {
    title: 'dashboard.analytics.title',
    type: 'menu',
  },
});

const router = useRouter();

onMounted(() => {
  router.replace('/dashboard/analytics');
});
</script>

<template>
  <div></div>
</template>
