// cspell:ignore presentationml
import { describe, expect, it } from 'vitest';

import { createMockFile } from '@/test-utils/mock.factory';

import {
  attachmentRejection,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TURN,
  toRagflowFiles,
} from './attachment-policy';

const file = (originalname: string, mimetype: string) =>
  createMockFile({ originalname, mimetype });

describe('attachmentRejection 白名单（扩展名 + MIME 都要过）', () => {
  it.each([
    ['报告.pdf', 'application/pdf'],
    [
      'a.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'a.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    ['a.md', 'text/markdown'],
    ['a.html', 'text/html'],
    ['a.txt', 'text/plain'],
    ['A.PDF', 'application/pdf'],
    // 浏览器认不出类型时给 octet-stream，此时只看扩展名
    ['a.md', 'application/octet-stream'],
  ])('放行 %s (%s)', (name, mime) => {
    expect(attachmentRejection(file(name, mime))).toBeUndefined();
  });

  it.each([
    ['a.exe', 'application/octet-stream'],
    ['a.xyz', 'text/plain'],
    ['a.xlsx', 'application/vnd.ms-excel'],
    ['README', 'text/plain'],
  ])('拒绝扩展名不在白名单的 %s', (name, mime) => {
    expect(attachmentRejection(file(name, mime))).toMatch(/不支持的文件类型/);
  });

  it('扩展名合法但 MIME 对不上也拒绝（改扩展名冒充）', () => {
    expect(attachmentRejection(file('a.pdf', 'text/html'))).toMatch(
      /不支持的文件类型/,
    );
  });

  it.each([
    ['a.doc', 'application/msword', 'docx'],
    ['a.ppt', 'application/vnd.ms-powerpoint', 'pptx'],
  ])('%s 提示另存为新格式', (name, mime, target) => {
    expect(attachmentRejection(file(name, mime))).toContain(`另存为 ${target}`);
  });
});

describe('附件数量与大小上限', () => {
  it('每轮最多 5 个、单个不超过 20 MiB', () => {
    expect(MAX_ATTACHMENTS_PER_TURN).toBe(5);
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('toRagflowFiles', () => {
  it('只取 RAGFlow 解析附件时读的四个字段，并按请求顺序排列', () => {
    const rows = [
      {
        fileId: 'f2',
        name: 'b.md',
        mimeType: 'text/markdown',
        createdBy: 't1',
      },
      {
        fileId: 'f1',
        name: 'a.pdf',
        mimeType: 'application/pdf',
        createdBy: 't1',
      },
    ];

    expect(toRagflowFiles(rows, ['f1', 'f2'])).toEqual([
      {
        id: 'f1',
        name: 'a.pdf',
        mime_type: 'application/pdf',
        created_by: 't1',
      },
      { id: 'f2', name: 'b.md', mime_type: 'text/markdown', created_by: 't1' },
    ]);
  });
});
