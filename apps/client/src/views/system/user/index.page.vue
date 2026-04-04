<script setup lang="ts">
import type { SearchParams, UserInfo } from '@/api/system/user';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { NTag } from 'naive-ui';
import {
  createProModalForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import { PERMISSION } from '@/config/constants/permissionCodes';
import { getDeptList } from '@/api/system/dept';
import { getRoleList } from '@/api/system/role';
import {
  changePassword,
  createUser,
  deleteUser,
  getUserDetail,
  getUserList,
  updateUser,
} from '@/api/system/user';
import TableAction from '@/components/common/TableAction.vue';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'system.user.title',
    type: 'menu',
  },
});

const loading = ref(false);
const modalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      modalForm.values.value.id
        ? await updateUser(modalForm.values.value.id, values)
        : await createUser(values);
      modalForm.close();
      reset();
    } finally {
      loading.value = false;
    }
  },
});
const resetPasswordForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      await changePassword(values);
      resetPasswordForm.close();
    } finally {
      loading.value = false;
    }
  },
});
const columns = computed<ProDataTableColumns<UserInfo>>(() => [
  {
    title: $t('common.index'),
    type: 'index',
    width: 80,
  },
  { title: $t('page.system.user.username'), key: 'username' },
  { title: $t('page.system.user.nickname'), key: 'nickname' },
  {
    title: $t('page.system.user.roles'),
    key: 'roles',
    render: (row) => row.roles.map((role) => role.name).join(', '),
  },
  { title: $t('page.system.user.email'), key: 'email' },
  {
    title: $t('page.system.user.dept'),
    key: 'dept.name',
    render: (row) => {
      const deptName = (row as unknown as { dept?: { name: string } }).dept?.name ?? '';
      if (row.isDeptAdmin) {
        return h('span', [
          deptName,
          h(
            NTag,
            { type: 'warning', size: 'small', class: 'ml-2' },
            () => $t('page.system.user.deptAdmin'),
          ),
        ]);
      }
      return deptName;
    },
  },
  {
    title: $t('common.status'),
    key: 'status',
    width: 100,
    render: (rowData) =>
      h(NTag, { type: rowData.status ? 'success' : 'error' }, () =>
        rowData.status ? $t('common.enable') : $t('common.disable'),
      ),
  },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 250,
    render: (row) =>
      h(TableAction, {
        actions: row.isAdmin
          ? []
          : [
              {
                type: 'edit',
                auth: PERMISSION.SYSTEM.USER.UPDATE,
                onClick: () => edit(row),
              },
              {
                label: $t('page.system.user.resetPassword'),
                auth: PERMISSION.SYSTEM.USER.UPDATE,
                buttonProps: {
                  type: 'warning',
                  quaternary: true,
                  onClick: () => resetPassword(row),
                },
              },
              {
                type: 'del',
                auth: PERMISSION.SYSTEM.USER.DELETE,
                onClick: async () => {
                  await deleteUser(row.id);
                  reset();
                },
              },
            ],
      }),
  },
]);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.system.user.username'), path: 'username' },
  { title: $t('page.system.user.email'), path: 'email' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (params, formData) => {
    const { data } = await getUserList({ ...params, ...formData });
    return { total: data?.totalCount || 0, list: data?.list || [] };
  },
  { form: searchForm },
);

const edit = async (row: UserInfo) => {
  const { data } = await getUserDetail(row.id);
  modalForm.values.value = {
    ...data,
    roleIds: data?.roles.map((role) => role.id),
  };
  modalForm.open();
};

const resetPassword = async (row: UserInfo) => {
  const { data } = await getUserDetail(row.id);
  resetPasswordForm.values.value = data;
  resetPasswordForm.open();
};

const roleOptions = ref<{ label: string; value: number }[]>([]);
const deptOptions = ref<{ label: string; value: number }[]>([]);
onMounted(async () => {
  const { data: roleData } = await getRoleList();
  const { data: deptData } = await getDeptList();
  roleOptions.value =
    roleData?.list.map((role) => ({
      label: role.name,
      value: role.id,
    })) || [];
  deptOptions.value =
    deptData?.map((dept) => ({
      label: dept.name,
      value: dept.id,
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
      :title="$t('page.system.user.title')"
      flex-height
      row-key="id"
      :columns="columns"
      v-bind="tableProps"
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
      :form="modalForm"
      :loading="loading"
      :title="`${modalForm.values.value.id ? $t('page.system.user.editUser') : $t('page.system.user.addUser')}`"
      preset="card"
      label-width="80"
      label-placement="left"
    >
      <pro-input
        :title="$t('page.system.user.username')"
        path="username"
        required
      />
      <pro-input :title="$t('page.system.user.nickname')" path="nickname" />
      <pro-input
        :title="$t('page.system.user.email')"
        path="email"
        required
        :rule="{ type: 'email', message: $t('page.system.user.invalidEmail') }"
      />
      <pro-select
        :title="$t('page.system.user.roles')"
        path="roleIds"
        required
        :field-props="{
          options: roleOptions,
          multiple: true,
        }"
      />
      <pro-select
        :title="$t('page.system.user.dept')"
        path="deptId"
        :field-props="{ options: deptOptions }"
      />
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
      <pro-password
        v-if="!modalForm.values.value.id"
        :title="$t('page.system.user.password')"
        path="password"
        required
        :field-props="{
          showPasswordOn: 'click',
        }"
      />
    </pro-modal-form>
    <pro-modal-form
      :form="resetPasswordForm"
      :loading="loading"
      :title="$t('page.system.user.resetPassword')"
      preset="card"
      label-width="100"
      label-placement="left"
    >
      <pro-input
        :title="$t('page.system.user.oldPassword')"
        path="password"
        required
      />
      <pro-input
        :title="$t('page.system.user.newPassword')"
        path="newPassword"
        required
      />
    </pro-modal-form>
  </div>
</template>
