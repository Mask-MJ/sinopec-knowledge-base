<script setup lang="ts">
import type { LoginlogInfo, SearchParams } from '@/api/monitor/loginlog';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { NTag } from 'naive-ui';
import { createProSearchForm, useNDataTable } from 'pro-naive-ui';

import { getLoginlogList } from '@/api/monitor/loginlog';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'monitor.loginLog.title',
    type: 'menu',
  },
});

const columns = computed<ProDataTableColumns<LoginlogInfo>>(() => [
  {
    title: $t('common.index'),
    type: 'index',
    width: 60,
  },
  { title: $t('page.monitor.loginLog.username'), key: 'username' },
  { title: $t('page.monitor.loginLog.ip'), key: 'ip' },
  { title: $t('page.monitor.loginLog.address'), key: 'address' },
  { title: $t('page.monitor.loginLog.os'), key: 'os' },
  { title: $t('page.monitor.loginLog.browser'), key: 'browser' },
  {
    title: $t('page.monitor.loginLog.message'),
    key: 'message',
    render: (row) =>
      h(NTag, { type: row.status ? 'success' : 'error', size: 'small' }, () =>
        row.status
          ? $t('page.monitor.loginLog.success')
          : $t('page.monitor.loginLog.failure'),
      ),
  },
  { title: $t('page.monitor.loginLog.loginTime'), key: 'createdAt' },
]);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.monitor.loginLog.username'), path: 'username' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps },
} = useNDataTable(
  async (params, formData) => {
    const { data } = await getLoginlogList({ ...params, ...formData });
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
      :title="$t('page.monitor.loginLog.title')"
      flex-height
      row-key="id"
      :columns="columns"
      v-bind="tableProps"
    />
  </div>
</template>
