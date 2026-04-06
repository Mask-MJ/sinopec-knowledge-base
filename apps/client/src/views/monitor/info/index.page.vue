<script setup lang="ts">
import { getSystemInfo } from '@/api/monitor/info';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'page.monitor.info.title',
    type: 'menu',
  },
});

const loading = ref(true);
const systemInfo = reactive({
  osInfo: { platform: '-', hostname: '-', arch: '-', release: '-' },
  cpu: { manufacturer: '-', brand: '-', cores: 0, speed: '-' },
  memory: { total: '-', used: '-', free: '-', usage: '-' },
});

const fetchData = async () => {
  loading.value = true;
  try {
    const { data } = await getSystemInfo();
    if (data) {
      Object.assign(systemInfo, data);
    }
  } finally {
    loading.value = false;
  }
};

onMounted(fetchData);
</script>

<template>
  <div class="p-4">
    <n-spin :show="loading">
      <n-grid :cols="2" :x-gap="16" :y-gap="16">
        <n-gi>
          <n-card :title="$t('page.monitor.info.os')">
            <n-descriptions :column="1" label-placement="left" bordered>
              <n-descriptions-item label="平台">
                {{ systemInfo.osInfo.platform }}
              </n-descriptions-item>
              <n-descriptions-item label="主机名">
                {{ systemInfo.osInfo.hostname }}
              </n-descriptions-item>
              <n-descriptions-item label="架构">
                {{ systemInfo.osInfo.arch }}
              </n-descriptions-item>
              <n-descriptions-item label="版本">
                {{ systemInfo.osInfo.release }}
              </n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card :title="$t('page.monitor.info.cpu')">
            <n-descriptions :column="1" label-placement="left" bordered>
              <n-descriptions-item label="制造商">
                {{ systemInfo.cpu.manufacturer }}
              </n-descriptions-item>
              <n-descriptions-item label="品牌">
                {{ systemInfo.cpu.brand }}
              </n-descriptions-item>
              <n-descriptions-item label="核心数">
                {{ systemInfo.cpu.cores }}
              </n-descriptions-item>
              <n-descriptions-item label="速率">
                {{ systemInfo.cpu.speed }} GHz
              </n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-gi>
        <n-gi :span="2">
          <n-card :title="$t('page.monitor.info.memory')">
            <n-descriptions :column="4" label-placement="left" bordered>
              <n-descriptions-item label="总内存">
                {{ systemInfo.memory.total }}
              </n-descriptions-item>
              <n-descriptions-item label="已用">
                {{ systemInfo.memory.used }}
              </n-descriptions-item>
              <n-descriptions-item label="剩余">
                {{ systemInfo.memory.free }}
              </n-descriptions-item>
              <n-descriptions-item label="使用率">
                {{ systemInfo.memory.usage }}
              </n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>
