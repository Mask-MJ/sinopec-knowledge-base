<script setup lang="ts">
import type {
  KnowledgeBaseInfo,
  SearchParamsWithDocument,
} from '@/api/knowledgeBase';
import type { SearchParams } from '@/api/system/role';
import type { ProSearchFormColumns } from 'pro-naive-ui';

import { NProgress, NSwitch, NTag, NTooltip } from 'naive-ui';
import { createProSearchForm, useNDataTable } from 'pro-naive-ui';

import {
  deleteDocuments,
  downloadKnowledgeBaseFile,
  getKnowledgeBaseDetail,
  getKnowledgeBaseFileList,
  parseDocuments,
  stopParseDocuments,
  toggleDocumentStatus,
  uploadKnowledgeBaseDocuments,
} from '@/api/knowledgeBase';
import TableAction from '@/components/common/TableAction.vue';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';
import { downloadFileFromBlobPart } from '@/utils';
import { formatDateTime } from '@/utils/date';

/** 文件大小格式化 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 解析状态项 */
interface RunStatusItem {
  label: string;
  type: 'default' | 'error' | 'info' | 'success' | 'warning';
}

/** 解析状态映射 */
const RUN_STATUS_MAP: Record<string, RunStatusItem> = {
  CANCEL: { label: '已取消', type: 'warning' },
  DONE: { label: '已完成', type: 'success' },
  FAIL: { label: '失败', type: 'error' },
  RUNNING: { label: '解析中', type: 'info' },
  UNSTART: { label: '未解析', type: 'default' },
};

const DEFAULT_STATUS: RunStatusItem = { label: '未解析', type: 'default' };

const router = useRouter();
const knowledgeBaseId = computed(() => {
  const params = router.currentRoute.value.params as { id: string };
  return Number(params.id);
});

/** 切换文档启用状态 */
async function handleToggleStatus(row: any) {
  const newStatus = row.status === '1' ? '0' : '1';
  try {
    await toggleDocumentStatus(knowledgeBaseId.value, row.id, newStatus);
    row.status = newStatus;
  } catch {
    window.$message.error('切换状态失败');
  }
}

// 解析任务轮询
const pollingTimer = ref<ReturnType<typeof setInterval>>();

function startPolling() {
  stopPolling();
  pollingTimer.value = setInterval(() => {
    reset();
  }, 5000);
}

function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value);
    pollingTimer.value = undefined;
  }
}

onUnmounted(() => {
  stopPolling();
});

// 文件上传模态框
const showUploadModal = ref(false);
const uploadLoading = ref(false);
const fileList = ref<import('naive-ui').UploadFileInfo[]>([]);

async function handleUpload() {
  const files = fileList.value
    .map((f) => f.file)
    .filter((f): f is File => f !== null && f !== undefined);
  if (files.length === 0) {
    window.$message.warning('请选择文件');
    return;
  }
  try {
    uploadLoading.value = true;
    await uploadKnowledgeBaseDocuments(knowledgeBaseId.value, files);
    window.$message.success('上传成功');
    showUploadModal.value = false;
    fileList.value = [];
    reset();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '上传失败';
    window.$message.error(msg);
  } finally {
    uploadLoading.value = false;
  }
}

const columns = computed(() => [
  {
    title: $t('page.knowledgeBase.detail.fileName'),
    key: 'name',
    width: 200,
    ellipsis: { tooltip: true },
  },
  {
    title: $t('page.knowledgeBase.detail.uploadDate'),
    key: 'create_date',
    width: 170,
    sorter: true,
    render: (row: any) => formatDateTime(row.create_date ?? row.create_time),
  },
  {
    title: $t('page.knowledgeBase.detail.sourceType'),
    key: 'source_type',
    width: 80,
    render: (row: any) =>
      h(NTag, { size: 'small', bordered: false }, () =>
        row.source_type === 'local' ? '本地' : row.source_type,
      ),
  },
  {
    title: $t('common.status'),
    key: 'status',
    width: 80,
    render: (row: any) =>
      h(NSwitch, {
        value: row.status === '1',
        onUpdateValue: () => handleToggleStatus(row),
      }),
  },
  {
    title: $t('page.knowledgeBase.detail.chunkCount'),
    key: 'chunk_count',
    width: 80,
    align: 'center' as const,
  },
  {
    title: $t('page.knowledgeBase.detail.fileSize'),
    key: 'size',
    width: 90,
    render: (row: any) => formatFileSize(row.size ?? 0),
  },
  {
    title: $t('page.knowledgeBase.detail.progress'),
    key: 'progress',
    width: 160,
    render: (row: any) => {
      const runStatus = RUN_STATUS_MAP[row.run] ?? DEFAULT_STATUS;
      const percentage = Math.round((row.progress ?? 0) * 100);

      if (row.run === 'FAIL') {
        const lastError = (row.progress_msg ?? '')
          .split('\n')
          .findLast((l: string) => l.includes('[ERROR]'));
        return h(
          NTooltip,
          {},
          {
            trigger: () =>
              h(NTag, { size: 'small', type: 'error' }, () => runStatus.label),
            default: () => lastError ?? '解析失败',
          },
        );
      }

      if (row.run === 'RUNNING') {
        return h(NProgress, {
          type: 'line',
          percentage,
          indicatorPlacement: 'inside',
          processing: true,
          status: 'info',
        });
      }

      if (row.run === 'DONE') {
        return h(
          NTag,
          { size: 'small', type: 'success', bordered: false },
          () => runStatus.label,
        );
      }

      return h(
        NTag,
        { size: 'small', type: runStatus.type, bordered: false },
        () => runStatus.label,
      );
    },
  },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 280,
    render: (row: any) =>
      h(TableAction, {
        actions: [
          {
            label:
              row.run === 'RUNNING'
                ? $t('page.knowledgeBase.detail.stopParse')
                : $t('page.knowledgeBase.detail.parse'),
            buttonProps: {
              type: row.run === 'RUNNING' ? 'warning' : 'info',
              quaternary: true,
              onClick: async () => {
                try {
                  if (row.run === 'RUNNING') {
                    await stopParseDocuments(knowledgeBaseId.value, [row.id]);
                  } else {
                    await parseDocuments(knowledgeBaseId.value, [row.id]);
                    startPolling();
                  }
                  reset();
                } catch {
                  // 错误已由请求中间件处理
                }
              },
            },
          },
          {
            label: $t('common.download'),
            buttonProps: {
              type: 'default',
              quaternary: true,
              onClick: () => download(row),
            },
          },
          {
            type: 'del',
            auth: PERMISSION.KNOWLEDGE_BASE.DELETE,
            onClick: async () => {
              await deleteDocuments(knowledgeBaseId.value, [row.id]);
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
    const result = data as unknown as null | { docs: any[]; total: number };
    const list = result?.docs ?? [];
    // 有正在解析的任务时保持轮询，否则停止
    const hasRunning = list.some((doc: any) => doc.run === 'RUNNING');
    if (hasRunning) {
      if (!pollingTimer.value) startPolling();
    } else {
      stopPolling();
    }
    return { list, total: result?.total ?? 0 };
  },
  { form: searchForm },
);

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
          <n-button type="primary" ghost @click="showUploadModal = true">
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
            {{ $t('common.upload') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <n-modal
      v-model:show="showUploadModal"
      preset="card"
      :title="$t('common.upload')"
      style="width: 600px"
      :mask-closable="!uploadLoading"
      :closable="!uploadLoading"
    >
      <n-upload
        v-model:file-list="fileList"
        multiple
        :max="10"
        :default-upload="false"
        accept=".doc,.docx,.pdf,.xls,.xlsx,.csv,.md,.txt"
      >
        <n-upload-dragger>
          <div class="mb-3">
            <i class="i-ant-design:inbox-outlined text-4xl"></i>
          </div>
          <n-text>点击或拖拽文件到此区域上传</n-text>
          <n-p depth="3" class="mt-2">
            支持 doc、docx、pdf、xls、xlsx、csv、md、txt，单文件最大 50MB，最多
            10 个文件
          </n-p>
        </n-upload-dragger>
      </n-upload>
      <template #footer>
        <n-flex justify="end">
          <n-button :disabled="uploadLoading" @click="showUploadModal = false">
            {{ $t('common.cancel') }}
          </n-button>
          <n-button
            type="primary"
            :loading="uploadLoading"
            :disabled="fileList.length === 0"
            @click="handleUpload"
          >
            {{ $t('common.confirm') }}
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </div>
</template>
