import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_PROMPT_SECTION,
  DEFAULT_ASSISTANT_EMPTY_RESPONSE,
  DEFAULT_ASSISTANT_FREQUENCY_PENALTY,
  DEFAULT_ASSISTANT_SYSTEM_PROMPT,
} from './assistant.defaults';

describe('assistant defaults', () => {
  // 回归守护：线上 2026-08-30 / 09-01 两次「回答尾部退化成乱码」的根因就是这个值
  // 被设成 RAGFlow 出厂的 0.7。它是累加式惩罚，长答案里高频复现的 `[ID:n]` 引用和
  // 中文标点会被逐个罚出 top_p 候选窗口，输出先退化成空引用 `[]`、再雪崩成乱码。
  // 单变量对照数据见 assistant.defaults.ts 中该常量上方的注释。
  it('frequency_penalty 必须保持 0，不得调高', () => {
    expect(DEFAULT_ASSISTANT_FREQUENCY_PENALTY).toBe(0);
  });

  // D1：空回复非空时，知识库空召回会让 RAGFlow 直接短路返回、不调 LLM，附件被整轮无视
  it('空回复默认为空串', () => {
    expect(DEFAULT_ASSISTANT_EMPTY_RESPONSE).toBe('');
  });
});

describe('系统提示词里的附件条款', () => {
  it('附件条款写进了默认提示词', () => {
    expect(DEFAULT_ASSISTANT_SYSTEM_PROMPT).toContain(
      ATTACHMENT_PROMPT_SECTION,
    );
  });

  it('给附件单独定出处写法，不让模型把附件标成知识库的 [ID:n]', () => {
    expect(ATTACHMENT_PROMPT_SECTION).toContain('（附件：文件名）');
    expect(ATTACHMENT_PROMPT_SECTION).toMatch(/不要标.*\[ID:n\]/);
  });

  it('本轮没有附件时不许回答附件细节（D2）', () => {
    expect(ATTACHMENT_PROMPT_SECTION).toContain('本轮消息里没有附件');
  });

  // RAGFlow 用 Python str.format 填 system 提示词，多出的花括号会让整轮报 KeyError
  it('除 {knowledge} 外不含花括号', () => {
    expect(
      DEFAULT_ASSISTANT_SYSTEM_PROMPT.replace('{knowledge}', ''),
    ).not.toMatch(/[{}]/);
  });

  it('/no_think 仍在末尾', () => {
    expect(
      DEFAULT_ASSISTANT_SYSTEM_PROMPT.trimEnd().endsWith('/no_think'),
    ).toBe(true);
  });
});
