import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { KEYWORD_MATCHER } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';

describe('chunkTaggerService.tagDocument', () => {
  const ragflow = { request: vi.fn() };
  const matcher = { match: vi.fn() };
  let service: ChunkTaggerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkTaggerService,
        { provide: RagflowService, useValue: ragflow },
        { provide: KEYWORD_MATCHER, useValue: matcher },
      ],
    }).compile();
    service = moduleRef.get(ChunkTaggerService);
  });

  it('lists chunks, matches, PUTs important_keywords per non-empty chunk', async () => {
    matcher.match.mockReturnValue(['kw1']);
    ragflow.request
      .mockResolvedValueOnce({
        chunks: [
          { id: 'c1', content: 'a' },
          { id: 'c2', content: 'b' },
        ],
        total: 2,
      })
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r).toEqual({ totalChunks: 2, updated: 2, empty: 0, failed: 0 });
    expect(ragflow.request).toHaveBeenCalledTimes(3); // 1 GET + 2 PUT
    expect(ragflow.request).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/datasets/ds1/documents/doc1/chunks/c1',
      { important_keywords: ['kw1'] },
    );
  });

  it('counts empty when no keyword matched and no project keyword', async () => {
    matcher.match.mockReturnValue([]);
    ragflow.request.mockResolvedValueOnce({
      chunks: [{ id: 'c1', content: 'a' }],
      total: 1,
    });

    const r = await service.tagDocument('ds1', 'doc1', '未知.docx');

    expect(r).toEqual({ totalChunks: 1, updated: 0, empty: 1, failed: 0 });
    expect(ragflow.request).toHaveBeenCalledTimes(1); // only GET, no PUT
  });

  it('injects project keywords even when matcher returns empty', async () => {
    matcher.match.mockReturnValue([]);
    ragflow.request
      .mockResolvedValueOnce({ chunks: [{ id: 'c1', content: 'a' }], total: 1 })
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', '顺8井北.docx');

    expect(r.updated).toBe(1);
    expect(ragflow.request).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/datasets/ds1/documents/doc1/chunks/c1',
      { important_keywords: ['顺8井北', '顺8井北三维'] },
    );
  });

  it('counts failed when a PUT rejects, without aborting siblings', async () => {
    matcher.match.mockReturnValue(['kw']);
    ragflow.request
      .mockResolvedValueOnce({
        chunks: [
          { id: 'c1', content: 'a' },
          { id: 'c2', content: 'b' },
        ],
        total: 2,
      })
      .mockRejectedValueOnce(new Error('PUT c1 boom'))
      .mockResolvedValueOnce({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r).toEqual({ totalChunks: 2, updated: 1, empty: 0, failed: 1 });
  });

  it('returns all-zero result for a document with no chunks', async () => {
    matcher.match.mockReturnValue([]);
    ragflow.request.mockResolvedValueOnce({ chunks: [], total: 0 });
    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');
    expect(r).toEqual({ totalChunks: 0, updated: 0, empty: 0, failed: 0 });
    expect(ragflow.request).toHaveBeenCalledTimes(1); // only the GET
  });

  it('rejects when listing chunks (GET) fails', async () => {
    ragflow.request.mockRejectedValueOnce(new Error('GET boom'));
    await expect(service.tagDocument('ds1', 'doc1', 'X.docx')).rejects.toThrow(
      'GET boom',
    );
  });

  it('paginates until total reached', async () => {
    matcher.match.mockReturnValue(['k']);
    const page1 = {
      chunks: Array.from({ length: 100 }, (_, i) => ({
        id: `a${i}`,
        content: 'x',
      })),
      total: 150,
    };
    const page2 = {
      chunks: Array.from({ length: 50 }, (_, i) => ({
        id: `b${i}`,
        content: 'x',
      })),
      total: 150,
    };
    ragflow.request
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r.totalChunks).toBe(150);
    const getCalls = ragflow.request.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls.length).toBe(2);
  });
});
