import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_ACCEPT,
  attachmentError,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TURN,
} from './chat-attachment';

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name);

describe('attachmentError', () => {
  it.each(['a.pdf', 'a.docx', 'a.pptx', 'a.md', 'a.html', 'a.txt', 'A.PDF'])(
    '放行 %s',
    (name) => {
      expect(attachmentError(file(name))).toBeUndefined();
    },
  );

  it.each([
    ['a.doc', 'docx'],
    ['a.ppt', 'pptx'],
  ])('%s 提示另存为 %s', (name, target) => {
    expect(attachmentError(file(name))).toContain(`另存为 ${target}`);
  });

  it.each(['a.xlsx', 'a.exe', 'README'])('拒绝 %s', (name) => {
    expect(attachmentError(file(name))).toContain('不支持');
  });

  it('超过 20 MB 拒绝', () => {
    expect(attachmentError(file('a.pdf', MAX_ATTACHMENT_BYTES + 1))).toContain(
      '20 MB',
    );
    expect(
      attachmentError(file('a.pdf', MAX_ATTACHMENT_BYTES)),
    ).toBeUndefined();
  });
});

describe('与服务端一致的限额', () => {
  it('每轮最多 5 个', () => {
    expect(MAX_ATTACHMENTS_PER_TURN).toBe(5);
  });

  it('文件选择框只列出白名单格式', () => {
    expect(ATTACHMENT_ACCEPT).toBe('.pdf,.docx,.pptx,.md,.html,.txt');
  });
});
