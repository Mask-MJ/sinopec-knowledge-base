<script setup lang="ts">
import type {
  OperationlogInfo,
  SearchParams,
} from '@/api/monitor/operationlog';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { createProSearchForm, useNDataTable } from 'pro-naive-ui';

import { getOperationlogList } from '@/api/monitor/operationlog';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'monitor.operationLog.title',
    type: 'menu',
  },
});

const columns = computed<ProDataTableColumns<OperationlogInfo>>(() => [
  {
    title: $t('common.index'),
    type: 'index',
    width: 60,
  },
  { title: $t('page.monitor.operationLog.module'), key: 'module' },
  { title: $t('page.monitor.operationLog.name'), key: 'title' },
  {
    title: $t('page.monitor.operationLog.businessType'),
    key: 'businessType',
  },
  { title: $t('page.monitor.operationLog.username'), key: 'username' },
  { title: $t('page.monitor.operationLog.ip'), key: 'ip' },
  { title: $t('page.monitor.operationLog.address'), key: 'address' },
  {
    title: $t('page.monitor.operationLog.createdAt'),
    key: 'createdAt',
  },
]);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.monitor.operationLog.username'), path: 'username' },
  { title: $t('page.monitor.operationLog.module'), path: 'module' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps },
} = useNDataTable(
  async (params, formData) => {
    const { data } = await getOperationlogList({ ...params, ...formData });
    return { total: data?.totalCount || 0, list: data?.list || [] };
  },
  { form: searchForm },
);
</script>

<template>
  <div>
    <n-card class="mb-4">
      <pro-search-form
        :form="searchForm"
        :columns="searchColumns"
        v-bind="proSearchFormProps"
      />
    </n-card>
    <pro-data-table
      class="h-full"
      :title="$t('page.monitor.operationLog.title')"
      flex-height
      row-key="id"
      :columns="columns"
      v-bind="tableProps"
    />
  </div>
</template>
