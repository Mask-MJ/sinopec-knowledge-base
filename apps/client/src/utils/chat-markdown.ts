// 直接引声明文件而非 @/composables 桶文件，避免把全部 composables 拉进单测的类型检查
import type { Reference } from '@/composables/useSSEStream';

interface ExportableMessage {
  content?: string;
  reference?: Reference;
  role: string;
}

/** 回答里的 `[ID:N]` 引用标记（N 从 0 起），导出时转成页面上显示的 `[N+1]` */
const CITATION_REGEX = /\[ID:(\d+)\]/g;

function renderAnswer(content: string, reference?: Reference) {
  // tsconfig.vitest.json 的 lib 不含 ES2021，单测类型检查认不出 replaceAll
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const answer = content.replace(
    CITATION_REGEX,
    (_match: string, index: string) => `[${Number(index) + 1}]`,
  );
  const sources = reference?.doc_aggs ?? [];
  if (sources.length === 0) return ['## 答', answer];
  return [
    '## 答',
    answer,
    '**参考来源**',
    sources.map((doc) => `- ${doc.doc_name}`).join('\n'),
  ];
}

/**
 * 把一个会话的问答导出为 Markdown。
 * 只导出正文，不含思考过程；空消息（失败/未完成的回答）跳过；
 * 第一个问题之前的助手开场白不算问答，也跳过。
 * 没有可导出内容时返回空串。
 */
export function chatToMarkdown(
  title: string,
  messages: ReadonlyArray<ExportableMessage>,
): string {
  const firstQuestion = messages.findIndex(
    (message) => message.role === 'user',
  );
  if (firstQuestion === -1) return '';
  const blocks = messages
    .slice(firstQuestion)
    .filter((message) => message.content?.trim())
    .flatMap((message) =>
      message.role === 'user'
        ? ['## 问', message.content ?? '']
        : renderAnswer(message.content ?? '', message.reference),
    );
  if (blocks.length === 0) return '';
  return `${[`# ${title}`, ...blocks].join('\n\n')}\n`;
}
