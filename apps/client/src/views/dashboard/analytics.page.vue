<script setup lang="ts">
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'page.dashboard.analytics.title',
    type: 'menu',
  },
});

const stats = reactive({
  knowledgeBases: 0,
  documents: 0,
  assistants: 0,
  sessions: 0,
});

const loading = ref(false);
</script>

<template>
  <div class="p-4">
    <n-spin :show="loading">
      <n-grid :cols="4" :x-gap="16" :y-gap="16">
        <n-gi>
          <n-card>
            <n-statistic :label="$t('page.dashboard.analytics.knowledgeBases')">
              <template #prefix>
                <i class="i-ant-design:database-outlined text-primary mr-2"></i>
              </template>
              {{ stats.knowledgeBases }}
            </n-statistic>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card>
            <n-statistic :label="$t('page.dashboard.analytics.documents')">
              <template #prefix>
                <i
                  class="i-ant-design:file-text-outlined text-success mr-2"
                ></i>
              </template>
              {{ stats.documents }}
            </n-statistic>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card>
            <n-statistic :label="$t('page.dashboard.analytics.assistants')">
              <template #prefix>
                <i class="i-ant-design:robot-outlined text-warning mr-2"></i>
              </template>
              {{ stats.assistants }}
            </n-statistic>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card>
            <n-statistic :label="$t('page.dashboard.analytics.sessions')">
              <template #prefix>
                <i class="i-ant-design:message-outlined text-info mr-2"></i>
              </template>
              {{ stats.sessions }}
            </n-statistic>
          </n-card>
        </n-gi>
      </n-grid>

      <n-card class="mt-4" :title="$t('page.dashboard.analytics.overview')">
        <n-empty :description="$t('page.dashboard.analytics.noData')">
          <template #icon>
            <i class="i-ant-design:bar-chart-outlined text-4xl"></i>
          </template>
        </n-empty>
      </n-card>
    </n-spin>
  </div>
</template>
