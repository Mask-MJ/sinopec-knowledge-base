import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DocxPreprocessService } from '@/common/docx-preprocess/docx-preprocess.service';
import { HashingService } from '@/common/hashing';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import { AssistantService } from '@/modules/assistant/assistant.service';

import { SeedService } from './seed.service';

describe('default knowledge assistant bootstrap', () => {
  let seed: SeedService;
  let stored: null | Record<string, unknown>;
  const admin = {
    id: 1,
    username: 'admin',
    nickname: '管理员',
    isAdmin: true,
    isDeptAdmin: false,
    deptId: null,
    password: 'already-changed',
  };
  const prisma = {
    client: {
      role: { count: vi.fn(), findUnique: vi.fn() },
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      dict: { findUnique: vi.fn(), create: vi.fn() },
      knowledgeBase: { findFirst: vi.fn() },
      assistant: { findFirst: vi.fn(), create: vi.fn() },
    },
  };
  const ragflow = { request: vi.fn(), getLlmList: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    stored = null;
    prisma.client.role.count.mockResolvedValue(1);
    prisma.client.role.findUnique.mockResolvedValue(null);
    prisma.client.user.findUnique.mockResolvedValue(admin);
    prisma.client.user.findFirst.mockResolvedValue(admin);
    prisma.client.user.findUniqueOrThrow.mockResolvedValue(admin);
    prisma.client.dict.findUnique.mockResolvedValue(null);
    prisma.client.knowledgeBase.findFirst.mockResolvedValue({
      id: 1,
      name: '共享技术报告库',
      datasetId: 'public-dataset',
    });
    prisma.client.assistant.findFirst.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.client.assistant.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        stored = { id: 7, isGeneral: false, ...data };
        return Promise.resolve(stored);
      },
    );
    ragflow.request.mockResolvedValue({ id: 'ragflow-chat' });

    const module = await Test.createTestingModule({
      providers: [
        SeedService,
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: HashingService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ASSISTANT_DEFAULT_MODEL' ? 'chat@instance@provider' : '',
          },
        },
        { provide: RagflowService, useValue: ragflow },
        { provide: DocxPreprocessService, useValue: {} },
      ],
    }).compile();
    seed = module.get(SeedService);
  });

  async function start() {
    await seed.onApplicationBootstrap();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it('repairs an already-seeded deployment with a shared knowledge assistant', async () => {
    await start();

    expect(stored).toMatchObject({
      name: '物探知识库助手',
      isGeneral: false,
      permission: 'public',
      userId: 1,
      datasetIds: ['public-dataset'],
      assistantId: 'ragflow-chat',
      modelName: 'chat@instance@provider',
      frequencyPenalty: 0,
    });
    expect(ragflow.request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/chats',
      expect.objectContaining({
        dataset_ids: ['public-dataset'],
        llm_id: 'chat@instance@provider',
      }),
    );
    expect(ragflow.request.mock.calls[0]?.[2]).toMatchObject({
      prompt_config: { quote: true },
    });
  });

  it('preserves existing shared assistant settings on repeated starts', async () => {
    await start();
    stored = {
      ...stored,
      name: '管理员已调整',
      datasetIds: ['chosen-dataset'],
    };
    await start();

    expect(stored).toMatchObject({
      name: '管理员已调整',
      datasetIds: ['chosen-dataset'],
    });
    expect(ragflow.request).toHaveBeenCalledTimes(1);
    expect(prisma.client.assistant.findFirst).toHaveBeenCalledWith({
      where: { isGeneral: false, permission: 'public' },
    });
  });

  it('does not expose private, departmental or unlinked knowledge bases', async () => {
    prisma.client.knowledgeBase.findFirst.mockResolvedValue(null);
    await start();

    expect(prisma.client.knowledgeBase.findFirst).toHaveBeenCalledWith({
      where: { permission: 'public', datasetId: { not: null } },
      orderBy: { id: 'asc' },
    });
    expect(stored).toBeNull();
    expect(ragflow.request).not.toHaveBeenCalled();
  });

  it('does not create an assistant without an administrator', async () => {
    prisma.client.user.findFirst.mockResolvedValue(null);
    await start();
    expect(stored).toBeNull();
    expect(ragflow.request).not.toHaveBeenCalled();
  });

  it('does not delay startup while RAGFlow is still creating the assistant', async () => {
    let finishChat!: (value: { id: string }) => void;
    ragflow.request.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => {
          finishChat = resolve;
        }),
    );
    const startup = seed.onApplicationBootstrap();
    try {
      const completed = await Promise.race([
        startup.then(() => true),
        new Promise<boolean>((resolve) =>
          setImmediate(() => {
            resolve(false);
          }),
        ),
      ]);
      expect(completed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => setImmediate(resolve));
      finishChat({ id: 'slow-ragflow-chat' });
      await startup;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(stored).toMatchObject({ assistantId: 'slow-ragflow-chat' });
  });

  it('keeps startup available and retries after RAGFlow recovers', async () => {
    ragflow.request.mockRejectedValueOnce(new Error('RAGFlow unavailable'));
    await expect(start()).resolves.toBeUndefined();
    expect(stored).toBeNull();

    await start();
    expect(stored).toMatchObject({ permission: 'public' });
    expect(ragflow.request).toHaveBeenCalledTimes(2);
  });
});
