<script setup lang="ts">
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'monitor.online.title',
    type: 'menu',
  },
});

const onlineUsers = ref<any[]>([]);
const loading = ref(false);
</script>

<template>
  <div>
    <pro-data-table
      class="h-full"
      :title="$t('page.monitor.online.title')"
      flex-height
      row-key="id"
      :data="onlineUsers"
      :loading="loading"
      :columns="[
        { title: $t('page.monitor.online.username'), key: 'username' },
        { title: $t('page.monitor.online.ip'), key: 'ip' },
        { title: $t('page.monitor.online.loginTime'), key: 'loginTime' },
        { title: $t('page.monitor.online.status'), key: 'status' },
      ]"
    >
      <template #empty>
        <n-empty description="功能开发中，敬请期待">
          <template #icon>
            <i class="i-ant-design:tool-outlined text-4xl"></i>
          </template>
        </n-empty>
      </template>
    </pro-data-table>
  </div>
</template>
