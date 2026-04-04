<script setup lang="ts">
import type {
  KnowledgeBaseInfo,
  SearchParamsWithDocument,
} from '@/api/knowledgeBase';
import type { SearchParams } from '@/api/system/role';
import type { ProSearchFormColumns } from 'pro-naive-ui';

import { NTag } from 'naive-ui';
import {
  createProModalForm,
  createProSearchForm,
  useNDataTable,
} from 'pro-naive-ui';

import { PERMISSION } from '@/config/constants/permissionCodes';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  downloadKnowledgeBaseFile,
  getKnowledgeBaseDetail,
  getKnowledgeBaseFileList,
  updateKnowledgeBase,
} from '@/api/knowledgeBase';
import TableAction from '@/components/common/TableAction.vue';
import { $t } from '@/locales';
import { downloadFileFromBlobPart } from '@/utils';

const loading = ref(false);
const router = useRouter();
const knowledgeBaseId = computed(() => {
  const params = router.currentRoute.value.params as { id: string };
  return Number(params.id);
});
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

const columns = computed(() => [
  { title: $t('page.knowledgeBase.detail.fileName'), key: 'name' },
  {
    title: $t('common.status'),
    key: 'status',
    width: 100,
    render: (rowData: any) =>
      h(NTag, { type: rowData.status === '1' ? 'success' : 'error' }, () =>
        rowData.status ? $t('common.enable') : $t('common.disable'),
      ),
  },
  {
    title: $t('page.knowledgeBase.chunk_method.title'),
    key: 'chunk_method',
  },
  {
    title: $t('page.knowledgeBase.detail.chunkCount'),
    key: 'chunk_count',
  },
  { title: $t('page.knowledgeBase.detail.progress'), key: 'progress' },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 300,
    render: (row) =>
      h(TableAction, {
        actions: [
          {
            type: 'edit',
            auth: PERMISSION.KNOWLEDGE_BASE.UPDATE,
            onClick: () => edit(row),
          },
          {
            label: $t('common.download'),
            buttonProps: {
              type: 'warning',
              quaternary: true,
              onClick: () => download(row),
            },
          },
          {
            label:
              row.run === '1'
                ? $t('page.knowledgeBase.detail.stopParse')
                : $t('page.knowledgeBase.detail.parse'),
            buttonProps: {
              type: 'info',
              quaternary: true,
              onClick: () => download(row),
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

const searchColumns = computed<ProSearchFormColumns<SearchParams>>(() => [
  { title: $t('page.knowledgeBase.detail.fileName'), path: 'name' },
]);
const searchForm = createProSearchForm();

const {
  table: { tableProps },
  search: { proSearchFormProps, reset },
} = useNDataTable(
  async (_params, formData) => {
    const { data } = await getKnowledgeBaseFileList(
      knowledgeBaseId.value,
      formData as unknown as SearchParamsWithDocument,
    );
    const list = (data ?? []) as any[];
    return { list, total: list.length };
  },
  { form: searchForm },
);

const edit = async (row: KnowledgeBaseInfo) => {
  const { data } = await getKnowledgeBaseDetail(row.id);
  modalForm.values.value = data;
  modalForm.open();
};
const knowledgeBaseInfo = ref<KnowledgeBaseInfo>();
const title = computed(
  () => `知识库名称: ${knowledgeBaseInfo.value?.name || ''}`,
);
async function download(row: { dataset_id: string; id: string }) {
  const { response } = await downloadKnowledgeBaseFile(
    Number(row.dataset_id),
    row.id,
  );
  const contentDisposition = response.headers.get('content-disposition');
  const blob = await response.blob();
  const fileName = contentDisposition
    ? decodeURIComponent(
        (contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/) ||
          [])[1] || 'unknown',
      ).replaceAll(/['"]/g, '')
    : 'unknown';
  downloadFileFromBlobPart({ source: blob, fileName });
}
onMounted(async () => {
  const params = router.currentRoute.value.params as { id: string };
  const { data } = await getKnowledgeBaseDetail(Number(params.id));
  if (!data) return;
  knowledgeBaseInfo.value = data;
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
      :title="title"
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
            {{ $t('common.upload') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <pro-modal-form
      width="1000px"
      :title="$t('page.knowledgeBase.detail.rename')"
      :form="modalForm"
      :loading="loading"
      label-width="120"
      preset="card"
      label-placement="left"
    >
      <pro-input :title="$t('page.knowledgeBase.name')" path="name" required />
    </pro-modal-form>
  </div>
</template>
