<script setup lang="ts">
import type { DeptInfo, SearchParams } from '@/api/system/dept';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { has } from 'lodash-es';
import {
  createProModalForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import {
  createDept,
  deleteDept,
  getDeptDetail,
  getDeptList,
  updateDept,
} from '@/api/system/dept';
import { getAllUserList } from '@/api/system/user';
import TableAction from '@/components/common/TableAction.vue';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'system.dept.title',
    type: 'menu',
  },
});

const loading = ref(false);
const modalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      modalForm.values.value.id
        ? await updateDept(modalForm.values.value.id, values)
        : await createDept(values);
      modalForm.close();
      reset();
    } finally {
      loading.value = false;
    }
  },
});

const columns = computed<ProDataTableColumns<DeptInfo>>(() => [
  { title: $t('page.system.dept.name'), key: 'name' },
  { title: $t('page.system.dept.leader'), key: 'leader' },
  { title: $t('page.system.dept.phone'), key: 'phone' },
  { title: $t('page.system.dept.email'), key: 'email' },
  { title: $t('common.createdAt'), key: 'createdAt' },
  { title: $t('common.updatedAt'), key: 'updatedAt' },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 200,
    render: (row) =>
      h(TableAction, {
        actions: [
          {
            type: 'edit',
            auth: PERMISSION.SYSTEM.DEPT.UPDATE,
            onClick: () => edit(row),
          },
          {
            type: 'del',
            auth: PERMISSION.SYSTEM.DEPT.DELETE,
            onClick: async () => {
              await deleteDept(row.id);
              reset();
            },
          },
        ],
      }),
  },
]);

const title = computed(() =>
  has(modalForm.values.value, 'id')
    ? $t('page.system.dept.editDept')
    : $t('page.system.dept.addDept'),
);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.system.dept.name'), path: 'name' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (_params, formData) => {
    const { data } = await getDeptList(formData);
    return { list: data || [], total: data?.length || 0 };
  },
  { form: searchForm },
);

const edit = async (row: DeptInfo) => {
  const { data } = await getDeptDetail(row.id);
  modalForm.values.value = data;
  modalForm.open();
};
const userOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  const { data } = await getAllUserList();
  if (!data) return;
  userOptions.value =
    data.map((user) => ({
      label: user.username,
      value: user.id,
    })) || [];
});
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
      :title="$t('page.system.dept.title')"
      flex-height
      row-key="id"
      :columns="columns"
      v-bind="tableProps"
      :pagination="false"
    >
      <template #toolbar>
        <n-flex>
          <n-button type="primary" ghost @click="modalForm.show.value = true">
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
            {{ $t('common.add') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <pro-modal-form
      :title="title"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.system.dept.name')" path="name" required />
      <pro-select
        :title="$t('page.system.dept.leader')"
        required
        path="leaderId"
        :field-props="{ options: userOptions }"
      />
      <pro-input :title="$t('page.system.dept.phone')" path="phone" />
      <pro-input :title="$t('page.system.dept.email')" path="email" />
      <pro-digit :title="$t('common.sort')" path="order" />
      <pro-textarea :title="$t('common.remark')" path="remark" />
    </pro-modal-form>
  </div>
</template>
