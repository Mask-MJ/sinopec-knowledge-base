import type { VueWrapper } from '@vue/test-utils';

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { getKnowledgeBaseFileList } from '@/api/knowledgeBase';

import DetailPage from './[id].page.vue';

vi.mock('@/api/knowledgeBase', () => ({
  deleteDocuments: vi.fn(),
  downloadKnowledgeBaseFile: vi.fn(),
  getKnowledgeBaseDetail: vi.fn().mockResolvedValue({ data: undefined }),
  getKnowledgeBaseFileList: vi.fn(),
  parseDocuments: vi.fn(),
  stopParseDocuments: vi.fn(),
  toggleDocumentStatus: vi.fn(),
  uploadKnowledgeBaseDocuments: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ currentRoute: ref({ params: { id: '7' } }) }),
}));

const TOTAL = 300;

function mockDocs(run = 'DONE') {
  vi.mocked(getKnowledgeBaseFileList).mockResolvedValue({
    data: {
      docs: [{ id: 'doc-1', name: 'a.pdf', run, size: 1, chunk_count: 0 }],
      total: TOTAL,
    },
  } as never);
}

function lastQuery() {
  const calls = vi.mocked(getKnowledgeBaseFileList).mock.calls;
  return calls.at(-1)?.[1];
}

async function clickPage(wrapper: VueWrapper, page: number) {
  const item = wrapper
    .findAll('.n-pagination-item')
    .find((el) => el.text() === String(page));
  if (!item) throw new Error(`未渲染第 ${page} 页的翻页按钮`);
  await item.trigger('click');
  await flushPromises();
}

async function mountPage() {
  const wrapper = mount(DetailPage, {
    attachTo: document.body,
    global: { plugins: [createPinia()], stubs: { TableAction: true } },
  });
  await flushPromises();
  return wrapper;
}

describe('知识库详情页文档分页', () => {
  beforeEach(() => {
    vi.mocked(getKnowledgeBaseFileList).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('首次请求带上页码与每页条数', async () => {
    mockDocs();
    await mountPage();

    expect(lastQuery()).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('文档总数超过一页时渲染翻页控件，翻页请求对应页码', async () => {
    mockDocs();
    const wrapper = await mountPage();

    await clickPage(wrapper, 2);

    expect(lastQuery()).toMatchObject({ page: 2, pageSize: 10 });
  });

  it('解析中轮询刷新时停留在当前页，不跳回第 1 页', async () => {
    vi.useFakeTimers();
    mockDocs('RUNNING');
    const wrapper = await mountPage();

    await clickPage(wrapper, 3);
    expect(lastQuery()).toMatchObject({ page: 3 });

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();

    expect(lastQuery()).toMatchObject({ page: 3 });
  });
});
