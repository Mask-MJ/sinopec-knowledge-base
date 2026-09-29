<script setup lang="ts">
import MarkdownRender, { setCustomComponents } from 'markstream-vue';

import { $t } from '@/locales';
import { downloadFileFromBlob } from '@/utils';

import 'markstream-vue/index.css';

// 接口固定：物探智问、周报助手共用，调用方只提供文件名和 Markdown 内容
const props = defineProps<{
  filename: string;
  getMarkdown: () => string;
}>();

// 打印时 body 挂这个 class，打印样式据此只保留 .export-print-area
const PRINTING_CLASS = 'export-printing';

const printMarkdown = ref('');

// markstream 把 `[10]` 解析成 reference 节点，默认渲染会去掉方括号；
// 打印区按原文输出，和页面上的引用标记保持一致
const PRINT_CUSTOM_ID = 'export-print';
setCustomComponents(PRINT_CUSTOM_ID, {
  reference: (props: { node: { raw: string } }) => h('sup', props.node.raw),
});

/** 去掉文件系统不允许的字符，空名兜底 */
function safeFilename() {
  return props.filename.replaceAll(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

/** 取导出内容；为空时提示并返回 null */
function readMarkdown() {
  const markdown = props.getMarkdown();
  if (markdown.trim()) return markdown;
  window.$message.warning($t('common.noData'));
  return null;
}

function exportMarkdown() {
  const markdown = readMarkdown();
  if (markdown === null) return;
  downloadFileFromBlob({
    fileName: `${safeFilename()}.md`,
    source: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  });
}

function restoreAfterPrint(originalTitle: string) {
  document.body.classList.remove(PRINTING_CLASS);
  document.title = originalTitle;
  printMarkdown.value = '';
}

// PDF 走浏览器打印（「另存为 PDF」），不引入 PDF 生成依赖
async function exportPdf() {
  const markdown = readMarkdown();
  if (markdown === null) return;

  const originalTitle = document.title;
  printMarkdown.value = markdown;
  // 浏览器用 document.title 作为另存 PDF 的默认文件名
  document.title = safeFilename();
  document.body.classList.add(PRINTING_CLASS);
  window.addEventListener(
    'afterprint',
    () => restoreAfterPrint(originalTitle),
    {
      once: true,
    },
  );

  // 等打印区域的 Markdown 渲染进 DOM 再打开打印对话框
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  window.print();
}
</script>

<template>
  <div class="flex items-center gap-2">
    <NButton size="small" @click="exportMarkdown">
      {{ $t('common.exportMd') }}
    </NButton>
    <NButton size="small" @click="exportPdf">
      {{ $t('common.exportPdf') }}
    </NButton>
  </div>

  <Teleport to="body">
    <div v-if="printMarkdown" class="export-print-area">
      <MarkdownRender
        :custom-id="PRINT_CUSTOM_ID"
        :content="printMarkdown"
        :final="true"
        :max-live-nodes="0"
        :batch-rendering="false"
        :defer-nodes-until-visible="false"
        :viewport-priority="false"
        :typewriter="false"
      />
    </div>
  </Teleport>
</template>

<style>
@media screen {
  .export-print-area {
    display: none;
  }
}

@media print {
  body.export-printing > *:not(.export-print-area) {
    display: none !important;
  }

  html:has(body.export-printing),
  body.export-printing {
    height: auto !important;
    overflow: visible !important;
  }

  .export-print-area {
    padding: 0 8mm;
    color: #000;
  }
}
</style>
