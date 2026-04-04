<script setup lang="ts">
import type { RoleInfo, SearchParams } from '@/api/system/role';
import type { TreeOption } from 'naive-ui';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { has } from 'lodash-es';
import { NTag } from 'naive-ui';
import {
  createProDrawerForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import { getMenuList } from '@/api/system/menu';
import {
  createRole,
  deleteRole,
  getRoleDetail,
  getRoleList,
  updateRole,
} from '@/api/system/role';
import TableAction from '@/components/common/TableAction.vue';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';
import { transformationTree } from '@/utils';

definePage({
  meta: {
    title: 'system.role.title',
    type: 'menu',
  },
});

const loading = ref(false);
const drawerForm = createProDrawerForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      drawerForm.values.value.id
        ? await updateRole(drawerForm.values.value.id, values)
        : await createRole(values);
      drawerForm.close();
      reset();
    } finally {
      loading.value = false;
    }
  },
});

const columns = computed<ProDataTableColumns<RoleInfo>>(() => [
  { title: $t('page.system.role.name'), key: 'name' },
  { title: $t('page.system.role.value'), key: 'value' },
  { title: $t('page.system.role.order'), key: 'order' },
  {
    title: $t('common.status'),
    key: 'status',
    width: 100,
    render: (rowData) =>
      h(NTag, { type: rowData.status ? 'success' : 'error' }, () =>
        rowData.status ? $t('common.enable') : $t('common.disable'),
      ),
  },
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
            auth: PERMISSION.SYSTEM.ROLE.UPDATE,
            onClick: () => edit(row),
          },
          {
            type: 'del',
            auth: PERMISSION.SYSTEM.ROLE.DELETE,
            onClick: async () => {
              await deleteRole(row.id);
              reset();
            },
          },
        ],
      }),
  },
]);

const title = computed(() =>
  has(drawerForm.values.value, 'id')
    ? $t('page.system.role.editRole')
    : $t('page.system.role.addRole'),
);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.system.role.name'), path: 'name' },
  { title: $t('page.system.role.value'), path: 'value' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (params, formData) => {
    const { data } = await getRoleList({ ...params, ...formData });
    return { total: data?.totalCount || 0, list: data?.list || [] };
  },
  { form: searchForm },
);

const renderPrefix = ({ option }: { option: TreeOption }) =>
  h('i', { class: option.icon });

const edit = async (row: RoleInfo) => {
  const { data } = await getRoleDetail(row.id);
  drawerForm.values.value = data;
  drawerForm.open();
};

const menuOptions = ref<TreeOption[]>([]);

onMounted(async () => {
  const { data } = await getMenuList();
  if (!data) return;

  menuOptions.value = transformationTree(data, null) as TreeOption[];
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
      :title="$t('page.system.role.title')"
      flex-height
      row-key="id"
      :columns="columns"
      v-bind="tableProps"
    >
      <template #toolbar>
        <n-flex>
          <n-button type="primary" ghost @click="drawerForm.show.value = true">
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
            {{ $t('common.add') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <pro-drawer-form
      :form="drawerForm"
      :loading="loading"
      label-width="80"
      width="500"
      label-placement="left"
    >
      <pro-drawer-content :title="title" :native-scrollbar="false">
        <pro-input :title="$t('page.system.role.name')" path="name" required />
        <pro-input
          :title="$t('page.system.role.value')"
          path="value"
          required
        />
        <pro-digit :title="$t('page.system.dict.sort')" path="order" />
        <pro-radio-group
          :title="$t('common.status')"
          path="status"
          required
          :field-props="{
            options: [
              { label: $t('common.enable'), value: true },
              { label: $t('common.disable'), value: false },
            ],
          }"
        />
        <pro-textarea :title="$t('common.remark')" path="remark" />
        <pro-field
          :title="$t('page.system.role.authorization')"
          path="menuIds"
          required
          :field-props="{
            data: menuOptions,
            checkable: true,
            selectable: false,
            expandOnClick: true,
            defaultExpandAll: true,
            multiple: true,
            keyField: 'id',
            labelField: 'name',
            renderPrefix,
            checkedKeys: drawerForm.values.value.menuIds,
            onUpdateCheckedKeys: (value: number[]) => {
              drawerForm.values.value.menuIds = value;
            },
          }"
        >
          <template #input="{ inputProps }">
            <n-tree v-bind="inputProps" />
          </template>
        </pro-field>
      </pro-drawer-content>
    </pro-drawer-form>
  </div>
</template>
