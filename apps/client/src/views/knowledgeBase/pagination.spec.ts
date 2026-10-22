import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getKnowledgeBaseList } from '@/api/knowledgeBase';

import ListPage from './index.page.vue';

vi.mock('@/api/knowledgeBase', () => ({
  createKnowledgeBase: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
  getKnowledgeBaseDetail: vi.fn(),
  getKnowledgeBaseList: vi.fn(),
  getLlmList: vi.fn().mockResolvedValue([]),
  updateKnowledgeBase: vi.fn(),
}));
vi.mock('@/api/system/dict', () => ({
  getDictDataList: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('@/api/system/user', () => ({
  getAllUserList: vi.fn().mockResolvedValue({ data: [] }),
}));

function lastQuery() {
  return vi.mocked(getKnowledgeBaseList).mock.calls.at(-1)?.[0];
}

async function mountPage() {
  const wrapper = mount(ListPage, {
    attachTo: document.body,
    global: { plugins: [createPinia()], stubs: { TableAction: true } },
  });
  await flushPromises();
  return wrapper;
}

describe('知识库列表分页', () => {
  beforeEach(() => {
    vi.mocked(getKnowledgeBaseList).mockReset();
    vi.mocked(getKnowledgeBaseList).mockResolvedValue({
      data: { list: [{ id: 1, name: 'kb-1' }], totalCount: 25 },
    } as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('请求带上页码，超过一页时可翻到第 2 页', async () => {
    const wrapper = await mountPage();
    expect(lastQuery()).toMatchObject({ current: 1, pageSize: 10 });

    const pageTwo = wrapper
      .findAll('.n-pagination-item')
      .find((el) => el.text() === '2');
    if (!pageTwo) throw new Error('未渲染第 2 页的翻页按钮');

    await pageTwo.trigger('click');
    await flushPromises();

    expect(lastQuery()).toMatchObject({ current: 2, pageSize: 10 });
  });
});
