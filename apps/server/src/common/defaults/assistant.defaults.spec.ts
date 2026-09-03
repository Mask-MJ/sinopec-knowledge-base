import { describe, expect, it } from 'vitest';

import { DEFAULT_ASSISTANT_FREQUENCY_PENALTY } from './assistant.defaults';

describe('assistant defaults', () => {
  // 回归守护：线上 2026-08-30 / 09-01 两次「回答尾部退化成乱码」的根因就是这个值
  // 被设成 RAGFlow 出厂的 0.7。它是累加式惩罚，长答案里高频复现的 `[ID:n]` 引用和
  // 中文标点会被逐个罚出 top_p 候选窗口，输出先退化成空引用 `[]`、再雪崩成乱码。
  // 单变量对照数据见 assistant.defaults.ts 中该常量上方的注释。
  it('frequency_penalty 必须保持 0，不得调高', () => {
    expect(DEFAULT_ASSISTANT_FREQUENCY_PENALTY).toBe(0);
  });
});
