<script setup lang="ts">
import type { KnowledgeBaseInfo } from '@/api/knowledgeBase';
import type { SearchParams } from '@/api/system/role';
import type { ProDataTableColumns, ProSearchFormColumns } from 'pro-naive-ui';

import { has } from 'lodash-es';
import {
  createProModalForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBaseDetail,
  getKnowledgeBaseList,
  updateKnowledgeBase,
} from '@/api/knowledgeBase';
import { getAllUserList } from '@/api/system/user';
import TableAction from '@/components/common/TableAction.vue';
import { useLlmOptions } from '@/composables';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';

const { options: embeddingModelOptions, loading: llmLoading } = useLlmOptions('embedding');

const loading = ref(false);
const router = useRouter();
const modalForm = createProModalForm({
  onSubmit: async (values) => {
    try {
      loading.value = true;
      modalForm.values.value.id
        ? await updateKnowledgeBase(modalForm.values.value.id, values)
        : await createKnowledgeBase(values);

      modalForm.close();
    } catch {
      // do nothing
    } finally {
      loading.value = false;
    }

    reset();
  },
});

const columns = computed<ProDataTableColumns<KnowledgeBaseInfo>>(() => [
  { title: $t('page.knowledgeBase.name'), key: 'name' },
  {
    title: $t('page.knowledgeBase.permission.title'),
    key: 'permission',
    render: (row) =>
      row.permission === 'me'
        ? $t('page.knowledgeBase.permission.me')
        : $t('page.knowledgeBase.permission.team'),
  },
  {
    title: $t('page.knowledgeBase.chunk_method.title'),
    key: 'chunk_method',
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
            auth: PERMISSION.KNOWLEDGE_BASE.UPDATE,
            onClick: () => edit(row),
          },
          {
            label: $t('page.knowledgeBase.detail.title'),
            buttonProps: {
              type: 'warning',
              quaternary: true,
              onClick: () => {
                router.push(`/knowledgeBase/detail/${row.id}`);
              },
            },
          },
          {
            type: 'del',
            auth: PERMISSION.KNOWLEDGE_BASE.DELETE,
            onClick: async () => {
              await deleteKnowledgeBase(row.id);
              reset();
            },
          },
        ],
      }),
  },
]);

const title = computed(() =>
  has(modalForm.values.value, 'id')
    ? $t('page.knowledgeBase.editKnowledgeBase')
    : $t('page.knowledgeBase.addKnowledgeBase'),
);

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.knowledgeBase.name'), path: 'name' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (_params, formData) => {
    const { data } = await getKnowledgeBaseList(formData);
    return { list: data?.list || [], total: data?.totalCount || 0 };
  },
  { form: searchForm },
);

const edit = async (row: KnowledgeBaseInfo) => {
  const { data } = await getKnowledgeBaseDetail(row.id);
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
      :title="$t('page.knowledgeBase.title')"
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
      width="1000px"
      :title="title"
      :form="modalForm"
      :loading="loading"
      label-width="120"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.knowledgeBase.name')" path="name" required />
      <pro-select
        :title="$t('page.knowledgeBase.permission.title')"
        required
        path="permission"
        :field-props="{
          options: [
            {
              label: $t('page.knowledgeBase.permission.me'),
              value: 'me',
            },
            {
              label: $t('page.knowledgeBase.permission.team'),
              value: 'team',
            },
          ],
        }"
      />
      <pro-select
        :title="$t('page.knowledgeBase.embedding_model')"
        path="embeddingModel"
        :field-props="{
          options: embeddingModelOptions,
          loading: llmLoading,
          filterable: true,
          placeholder: '请选择向量模型',
        }"
      />
      <pro-select
        :title="$t('page.knowledgeBase.chunk_method.title')"
        required
        path="chunk_method"
        :field-props="{
          options: [
            {
              label: $t('page.knowledgeBase.chunk_method.naïve'),
              value: 'naïve',
            },
            {
              label: $t('page.knowledgeBase.chunk_method.laws'),
              value: 'laws',
            },
            {
              label: $t('page.knowledgeBase.chunk_method.manual'),
              value: 'manual',
            },
            {
              label: $t('page.knowledgeBase.chunk_method.presentation'),
              value: 'presentation',
            },
            {
              label: $t('page.knowledgeBase.chunk_method.qa'),
              value: 'qa',
            },
            {
              label: $t('page.knowledgeBase.chunk_method.table'),
              value: 'table',
            },
          ],
        }"
      />
      <pro-select
        :title="$t('page.knowledgeBase.parser_config.layout_recognize')"
        path="parser_config.layout_recognize"
        :field-props="{
          options: [
            { label: 'DeepDOC', value: 'DeepDOC' },
            { label: 'Plain Text', value: 'Plain Text' },
          ],
        }"
      />
      <pro-digit
        :title="$t('page.knowledgeBase.parser_config.chunk_token_num')"
        path="parser_config.chunk_token_num"
      />
      <pro-input
        :title="$t('page.knowledgeBase.parser_config.delimiter')"
        path="parser_config.delimiter"
      />
      <pro-digit :title="$t('common.sort')" path="order" />
      <pro-textarea :title="$t('common.remark')" path="description" />
    </pro-modal-form>
  </div>
</template>
