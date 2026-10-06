<script setup lang="ts">
import type {
  WeeklyReportInfo,
  WeeklyReportListItem,
} from '@/api/weeklyReport';

import dayjs from 'dayjs';
import MarkdownRender from 'markstream-vue';

import {
  deleteWeeklyReport,
  generateWeeklyReport,
  getWeeklyReportDetail,
  getWeeklyReportList,
} from '@/api/weeklyReport';
import ExportActions from '@/components/common/ExportActions.vue';
import { useDictMap } from '@/composables/useDictMap';
import { $t } from '@/locales';

import 'markstream-vue/index.css';

// 周报助手：对方报告服务无会话、一次一篇，历史由后端留档。
// 左侧历史、右侧正文、底部表单驱动生成，布局对齐物探智问页。

// 历史只取最近这么多篇，不做分页；真有人攒到上百篇再加「加载更多」
const HISTORY_LIMIT = 100;

const branchDict = useDictMap('weeklyReport.branch');
const typeDict = useDictMap('weeklyReport.type');

const history = ref<WeeklyReportListItem[]>([]);
const historyLoading = ref(true);
const activeId = ref<number>();
const activeReport = ref<WeeklyReportInfo>();
const detailLoading = ref(false);
const generating = ref(false);

const form = reactive({
  branch: null as null | string,
  reportDate: dayjs().format('YYYY-MM-DD'),
  reportType: null as null | string,
});

const optionsReady = computed(
  () =>
    branchDict.options.value.length > 0 && typeDict.options.value.length > 0,
);
const optionsMissing = computed(
  () =>
    !branchDict.loading.value && !typeDict.loading.value && !optionsReady.value,
);
const canGenerate = computed(() =>
  Boolean(form.branch && form.reportDate && form.reportType),
);

// 字典加载完默认选第一项，省一次点击
watch(branchDict.options, (options) => {
  form.branch ??= options[0]?.value ?? null;
});
watch(typeDict.options, (options) => {
  form.reportType ??= options[0]?.value ?? null;
});

/** 例：华东分公司 · 2025-09-20 周报 */
function reportTitle(item: WeeklyReportListItem) {
  return `${item.branch} · ${item.reportDate} ${typeDict.getDictLabel(item.reportType)}`;
}

const activeTitle = computed(() =>
  activeReport.value ? reportTitle(activeReport.value) : '',
);

async function selectReport(id: number) {
  activeId.value = id;
  detailLoading.value = true;
  try {
    const { data } = await getWeeklyReportDetail(id);
    // 快速连点时只认最后一次选择
    if (activeId.value === id) activeReport.value = data;
  } catch {
    // 请求层已弹出错误提示
  } finally {
    if (activeId.value === id) detailLoading.value = false;
  }
}

async function loadHistory() {
  try {
    const { data } = await getWeeklyReportList(HISTORY_LIMIT);
    history.value = data?.list ?? [];
    const first = history.value[0];
    if (first) await selectReport(first.id);
  } catch {
    // 请求层已弹出错误提示，列表保持为空
  } finally {
    historyLoading.value = false;
  }
}

async function generate() {
  if (!form.branch || !form.reportType || !canGenerate.value) return;
  generating.value = true;
  try {
    const { data } = await generateWeeklyReport({
      branch: form.branch,
      reportDate: form.reportDate,
      reportType: form.reportType,
    });
    if (!data) return;
    const { content: _content, ...item } = data;
    history.value = [item, ...history.value];
    activeId.value = data.id;
    activeReport.value = data;
    detailLoading.value = false;
    window.$message.success($t('page.weekly.generated'));
  } catch {
    // 超时、对方出错等中文提示由请求层弹出
  } finally {
    generating.value = false;
  }
}

async function removeReport(id: number) {
  try {
    await deleteWeeklyReport(id);
  } catch {
    return;
  }
  history.value = history.value.filter((item) => item.id !== id);
  if (activeId.value === id) {
    activeId.value = undefined;
    activeReport.value = undefined;
  }
  window.$message.success($t('common.deleteSuccess'));
}

function getMarkdown() {
  return activeReport.value?.content ?? '';
}

onMounted(loadHistory);
</script>

<template>
  <div class="h-full p-4">
    <NCard
      class="h-full"
      content-style="height: 100%; display: flex; min-height: 0;"
    >
      <!-- 左侧：历史报告 -->
      <div
        class="w-72 flex shrink-0 flex-col border-r border-[var(--n-border-color)] pr-4"
      >
        <div class="mb-3 py-2 text-base font-semibold">
          {{ $t('page.weekly.history') }}
        </div>

        <div v-if="historyLoading" class="flex-center py-8">
          <NSpin size="small" />
        </div>
        <div
          v-else-if="history.length === 0"
          class="flex-col-center gap-2 py-8 opacity-50"
        >
          <i class="i-ant-design:inbox-outlined text-3xl"></i>
          <span class="text-sm">{{ $t('page.weekly.noHistory') }}</span>
        </div>
        <div v-else class="flex-1 overflow-y-auto">
          <div
            v-for="item in history"
            :key="item.id"
            class="report-item group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors duration-150"
            :class="
              activeId === item.id
                ? 'report-active bg-primary/10 font-medium dark:bg-primary/18'
                : 'hover:bg-primary/6 dark:hover:bg-primary/10'
            "
            @click="selectReport(item.id)"
          >
            <div class="min-w-0 flex-1">
              <NEllipsis :line-clamp="1" class="text-sm">
                {{ reportTitle(item) }}
              </NEllipsis>
              <div class="mt-0.5 text-xs opacity-50">
                {{ item.createdAt.slice(0, 16) }}
              </div>
            </div>
            <NPopconfirm @positive-click="removeReport(item.id)">
              <template #trigger>
                <NButton
                  quaternary
                  circle
                  size="tiny"
                  class="opacity-0 group-hover:opacity-100"
                  :aria-label="$t('common.delete')"
                  @click.stop
                >
                  <template #icon>
                    <i class="i-ant-design:delete-outlined"></i>
                  </template>
                </NButton>
              </template>
              {{ $t('page.weekly.deleteConfirm') }}
            </NPopconfirm>
          </div>
        </div>
      </div>

      <!-- 右侧：正文 + 生成表单 -->
      <div class="min-w-0 flex flex-1 flex-col">
        <div
          class="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--n-border-color)] px-4 pb-3"
        >
          <span class="truncate text-base font-medium">{{ activeTitle }}</span>
          <ExportActions
            v-if="activeReport"
            :filename="activeTitle"
            :get-markdown="getMarkdown"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div v-if="detailLoading" class="h-full flex-center">
            <NSpin />
          </div>
          <MarkdownRender
            v-else-if="activeReport"
            :key="activeReport.id"
            custom-id="weekly"
            :content="activeReport.content"
            :final="true"
            :max-live-nodes="0"
            :typewriter="false"
          />
          <div v-else class="h-full flex-center">
            <NEmpty :description="$t('page.weekly.emptyTip')" />
          </div>
        </div>

        <div class="shrink-0 border-t border-[var(--n-border-color)] px-4 pt-3">
          <NAlert v-if="optionsMissing" type="warning" class="mb-3">
            {{ $t('page.weekly.noOptions') }}
          </NAlert>
          <div class="flex flex-wrap items-center gap-3">
            <NSelect
              v-model:value="form.branch"
              class="!w-48"
              :options="branchDict.options.value"
              :loading="branchDict.loading.value"
              :disabled="generating"
              :placeholder="$t('page.weekly.branch')"
            />
            <NDatePicker
              v-model:formatted-value="form.reportDate"
              class="!w-40"
              type="date"
              value-format="yyyy-MM-dd"
              :clearable="false"
              :disabled="generating"
            />
            <NSelect
              v-model:value="form.reportType"
              class="!w-32"
              :options="typeDict.options.value"
              :loading="typeDict.loading.value"
              :disabled="generating"
              :placeholder="$t('page.weekly.reportType')"
            />
            <NButton
              type="primary"
              :loading="generating"
              :disabled="!canGenerate"
              @click="generate"
            >
              {{ $t('page.weekly.generate') }}
            </NButton>
            <span v-if="generating" class="text-sm opacity-60">
              {{ $t('page.weekly.generating') }}
            </span>
          </div>
        </div>
      </div>
    </NCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: front
  title: page.portal.weekly
  hideInTab: true
</route>
