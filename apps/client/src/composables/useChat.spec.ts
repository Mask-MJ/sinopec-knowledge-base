import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { completions, uploadChatAttachments } from '@/api/assistant';

import { useChat } from './useChat';

vi.mock('@/api/assistant', () => ({
  completions: vi.fn(),
  uploadChatAttachments: vi.fn(),
}));

const emptyStream = () =>
  new ReadableStream<Uint8Array>({
    start: (c) => {
      c.close();
    },
  });

describe('useChat.send 附件', () => {
  beforeEach(() => {
    vi.mocked(completions).mockReset();
    vi.mocked(uploadChatAttachments).mockReset();
    vi.mocked(completions).mockResolvedValue({
      response: { body: emptyStream() },
    } as never);
    window.$message = { error: vi.fn() } as never;
  });

  it('没有附件时请求体与原来一致，不上传', async () => {
    const { send } = useChat(ref(1), ref('s1'));

    await send('q');

    expect(uploadChatAttachments).not.toHaveBeenCalled();
    expect(vi.mocked(completions).mock.calls[0]?.[1]).toStrictEqual({
      stream: true,
      sessionId: 's1',
      question: 'q',
    });
  });

  it('先上传附件，再带上附件 ID 提问，用户消息上显示文件名', async () => {
    vi.mocked(uploadChatAttachments).mockResolvedValue([
      { id: 'f1', name: 'a.pdf', mimeType: 'application/pdf', size: 1 },
    ]);
    const file = new File(['x'], 'a.pdf');
    const { messages, send } = useChat(ref(1), ref('s1'));

    await expect(send('q', [file])).resolves.toBe(true);

    expect(uploadChatAttachments).toHaveBeenCalledWith(1, 's1', [file]);
    expect(vi.mocked(completions).mock.calls[0]?.[1]).toStrictEqual({
      stream: true,
      sessionId: 's1',
      question: 'q',
      attachmentIds: ['f1'],
    });
    expect(messages.value[0]?.files).toEqual([{ name: 'a.pdf' }]);
  });

  it('上传失败时不提问，返回 false 让输入框保留问题和附件', async () => {
    vi.mocked(uploadChatAttachments).mockRejectedValue(new Error('太大了'));
    const { messages, send } = useChat(ref(1), ref('s1'));

    await expect(send('q', [new File(['x'], 'a.pdf')])).resolves.toBe(false);

    expect(completions).not.toHaveBeenCalled();
    expect(messages.value).toEqual([]);
    expect(window.$message.error).toHaveBeenCalledWith('太大了');
  });
});
