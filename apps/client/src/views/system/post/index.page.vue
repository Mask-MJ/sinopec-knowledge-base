<script setup lang="ts">
import type { PostInfo, SearchParams } from '@/api/system/post';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { has } from 'lodash-es';
import {
  createProModalForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import { PERMISSION } from '@/config/constants/permissionCodes';
import {
  createPost,
  deletePost,
  getPostDetail,
  getPostList,
  updatePost,
} from '@/api/system/post';
import TableAction from '@/components/common/TableAction.vue';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'system.post.title',
    type: 'menu',
  },
});

const loading = ref(false);
const modalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      modalForm.values.value.id
        ? await updatePost(modalForm.values.value.id, values)
        : await createPost(values);
      modalForm.close();
      reset();
    } finally {
      loading.value = false;
    }
  },
});

const columns = computed<ProDataTableColumns<PostInfo>>(() => [
  {
    title: $t('common.index'),
    type: 'index',
    width: 80,
  },
  { title: $t('page.system.post.name'), key: 'name' },
  { title: $t('page.system.post.code'), key: 'code' },
  { title: $t('page.system.post.sort'), key: 'order' },
  { title: $t('common.createdAt'), key: 'createdAt' },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 200,
    render: (row) =>
      h(TableAction, {
        actions: [
          {
            type: 'edit',
            auth: PERMISSION.SYSTEM.POST.UPDATE,
            onClick: () => edit(row),
          },
          {
            type: 'del',
            auth: PERMISSION.SYSTEM.POST.DELETE,
            onClick: async () => {
              await deletePost(row.id);
              reset();
            },
          },
        ],
      }),
  },
]);

const title = computed(() =>
  has(modalForm.values.value, 'id')
    ? $t('page.system.post.editPost')
    : $t('page.system.post.addPost'),
);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.system.post.name'), path: 'name' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (params, formData) => {
    const { data } = await getPostList({ ...params, ...formData });
    return { total: data?.totalCount || 0, list: data?.list || [] };
  },
  { form: searchForm },
);

const edit = async (row: PostInfo) => {
  const { data } = await getPostDetail(row.id);
  modalForm.values.value = data;
  modalForm.open();
};
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
      :title="$t('page.system.post.title')"
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
      :title="title"
      :form="modalForm"
      :loading="loading"
      label-width="80"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.system.post.name')" path="name" required />
      <pro-input :title="$t('page.system.post.code')" path="code" required />
      <pro-digit :title="$t('page.system.post.sort')" path="order" />
      <pro-textarea :title="$t('common.remark')" path="remark" />
    </pro-modal-form>
  </div>
</template>
