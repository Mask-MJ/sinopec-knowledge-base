<script setup lang="ts">
import { DEFAULT_HOME_PATH } from '@/config/constants';

definePage({
  meta: {
    title: 'page.dashboard.analytics.title',
    type: 'menu',
  },
});

const router = useRouter();

onMounted(() => {
  router.replace(DEFAULT_HOME_PATH);
});
</script>

<template>
  <div></div>
</template>
