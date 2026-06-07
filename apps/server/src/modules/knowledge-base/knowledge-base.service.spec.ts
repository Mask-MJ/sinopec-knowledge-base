import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChunkTagStore } from '@/common/chunk-tagger/chunk-tag-store';
import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DocxPreprocessService } from '@/common/docx-preprocess/docx-preprocess.service';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import { createMockActiveUser } from '@/test-utils/mock.factory';

import { KnowledgeBaseService } from './knowledge-base.service';

const ragflow = { request: vi.fn() };
const chunkTagStore = {
  enqueue: vi.fn(),
  listPending: vi.fn(),
  remove: vi.fn(),
};
const docxPreprocess = {};
const kbRecord = {
  id: 1,
  datasetId: 'ds1',
  createBy: 'admin',
  permission: 'me',
  deptId: null,
};
const prisma = {
  client: {
    knowledgeBase: { findUniqueOrThrow: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
  },
};
let service: KnowledgeBaseService;

beforeEach(async () => {
  vi.clearAllMocks();
  prisma.client.knowledgeBase.findUniqueOrThrow.mockResolvedValue(kbRecord);
  prisma.client.user.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    isAdmin: true,
    deptId: null,
  });
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      KnowledgeBaseService,
      { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
      { provide: RagflowService, useValue: ragflow },
      { provide: DocxPreprocessService, useValue: docxPreprocess },
      { provide: ChunkTagStore, useValue: chunkTagStore },
    ],
  }).compile();
  service = moduleRef.get(KnowledgeBaseService);
});

describe('knowledgeBaseService.parseDocuments', () => {
  it('enqueues documents after a successful parse trigger', async () => {
    ragflow.request.mockResolvedValue({ ok: true });
    chunkTagStore.enqueue.mockResolvedValue(undefined);

    const result = await service.parseDocuments(1, createMockActiveUser(), [
      'd1',
      'd2',
    ]);

    expect(ragflow.request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/datasets/ds1/chunks',
      { document_ids: ['d1', 'd2'] },
    );
    expect(chunkTagStore.enqueue).toHaveBeenCalledWith('ds1', ['d1', 'd2']);
    expect(result).toEqual({ ok: true });
  });

  it('does not enqueue and rethrows when the parse trigger fails', async () => {
    ragflow.request.mockRejectedValue(new Error('parse boom'));

    await expect(
      service.parseDocuments(1, createMockActiveUser(), ['d1']),
    ).rejects.toThrow('parse boom');
    expect(chunkTagStore.enqueue).not.toHaveBeenCalled();
  });

  it('still returns the parse result when enqueue fails (degraded)', async () => {
    ragflow.request.mockResolvedValue({ ok: true });
    chunkTagStore.enqueue.mockRejectedValue(new Error('redis down'));

    const result = await service.parseDocuments(1, createMockActiveUser(), [
      'd1',
    ]);

    expect(result).toEqual({ ok: true });
  });
});
