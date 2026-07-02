import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { ChunkTagQueueService } from './chunk-tag-queue.service';
import { ChunkTagStore } from './chunk-tag-store';
import { JOB_TIMEOUT_MS } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';

describe('chunkTagQueueService.pollOnce', () => {
  const store = { listPending: vi.fn(), remove: vi.fn(), enqueue: vi.fn() };
  const ragflow = { request: vi.fn() };
  const tagger = { tagDocument: vi.fn() };
  let service: ChunkTagQueueService;

  beforeEach(async () => {
    vi.clearAllMocks();
    store.remove.mockResolvedValue(undefined);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkTagQueueService,
        { provide: ChunkTagStore, useValue: store },
        { provide: RagflowService, useValue: ragflow },
        { provide: ChunkTaggerService, useValue: tagger },
      ],
    }).compile();
    service = moduleRef.get(ChunkTagQueueService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tags a DONE doc then removes it from pending', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'DONE' }],
      total: 1,
    });
    tagger.tagDocument.mockResolvedValue({
      totalChunks: 3,
      updated: 3,
      empty: 0,
      failed: 0,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).toHaveBeenCalledWith('ds1', 'd1', 'X.docx');
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('removes a FAIL doc without tagging', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'FAIL' }],
      total: 1,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('removes a doc that no longer exists (list succeeds but doc absent)', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({ docs: [], total: 0 });

    await service.pollOnce();

    expect(tagger.tagDocument).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('keeps pending members when listing a dataset fails (transient, no delete)', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockRejectedValue(new Error('ragflow 503'));

    await service.pollOnce();

    // 列举失败是暂时性的:绝不能误删待办
    expect(store.remove).not.toHaveBeenCalled();
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('keeps a RUNNING doc that has not timed out', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS - 1);
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'RUNNING' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).not.toHaveBeenCalled();
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('removes a RUNNING doc that has timed out', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS + 1);
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'RUNNING' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('tags a DONE doc even if its enqueuedAt is very old (timeout ignores DONE)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS * 10);
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'DONE' }],
      total: 1,
    });
    tagger.tagDocument.mockResolvedValue({
      totalChunks: 1,
      updated: 1,
      empty: 0,
      failed: 0,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).toHaveBeenCalledWith('ds1', 'd1', 'X.docx');
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('keeps a doc with an unknown run value (does not remove)', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: '5' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).not.toHaveBeenCalled();
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('groups pending by dataset: one GET per dataset', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [
        { id: 'd1', name: 'A.docx', run: 'FAIL' },
        { id: 'd2', name: 'B.docx', run: 'FAIL' },
      ],
      total: 2,
    });

    await service.pollOnce();

    const getCalls = ragflow.request.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls.length).toBe(1); // 同一 dataset 只列一次
    expect(store.remove).toHaveBeenCalledTimes(2);
  });

  it('reentrancy guard: a second concurrent pollOnce is a no-op', async () => {
    let release: () => void = () => undefined;
    store.listPending.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve([]);
          };
        }),
    );
    const first = service.pollOnce();
    const second = service.pollOnce(); // 第一轮未完成
    expect(store.listPending).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });

  it('does not throw when listPending rejects (degrades)', async () => {
    store.listPending.mockRejectedValue(new Error('redis down'));
    await expect(service.pollOnce()).resolves.toBeUndefined();
  });
});
