import { flushPromises, shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { getChatSessionList } from '@/api/assistant';

import ChatSidebar from './ChatSidebar.vue';

vi.mock('@/api/assistant', () => ({
  createChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  getChatSessionList: vi.fn().mockResolvedValue({ data: [] }),
  updateChatSession: vi.fn(),
}));

describe('chatSidebar 会话列表', () => {
  it('按后端单次可取上限请求，避免默认每页 30 条截断历史会话', async () => {
    shallowMount(ChatSidebar, { props: { assistantId: 3 } });
    await flushPromises();

    expect(getChatSessionList).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ pageSize: 100 }),
    );
  });
});
