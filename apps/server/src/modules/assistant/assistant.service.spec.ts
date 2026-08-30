import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import {
  createMockActiveUser,
  createMockPrismaService,
} from '@/test-utils/mock.factory';

import { AssistantService } from './assistant.service';

const fakeChunk = (id: string, docId = 'doc-X', docName = 'X.docx') => ({
  id,
  content: `chunk-${id}`,
  dataset_id: 'd1',
  doc_type: '',
  document_id: docId,
  document_name: docName,
  image_id: '',
  positions: [],
  similarity: 0.9,
  term_similarity: 0.5,
  url: null,
  vector_similarity: 0.7,
});

describe('assistantService.findAllSessions', () => {
  let service: AssistantService;
  const ragflow = { request: vi.fn() };
  const prisma = createMockPrismaService();

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: ConfigService, useValue: { get: () => 'test-model' } },
      ],
    }).compile();
    service = module.get(AssistantService);

    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      assistantId: 'rf-1',
      deptId: null,
      permission: 'me',
      userId: 1,
    });
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({
      deptId: null,
      id: 1,
      isAdmin: false,
    });
    prisma.client.assistantSession.findMany.mockResolvedValue([]);
  });

  it('拒绝非创建者读取私有助手的会话（此前该入口无任何权限校验）', async () => {
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      assistantId: 'rf-1',
      deptId: null,
      permission: 'me',
      userId: 99,
    });

    await expect(
      service.findAllSessions(1, createMockActiveUser(), {}),
    ).rejects.toThrow(/无权访问此助手/);
    expect(ragflow.request).not.toHaveBeenCalled();
  });

  it('public 助手允许非创建者使用', async () => {
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      assistantId: 'rf-1',
      deptId: null,
      permission: 'public',
      userId: 99,
    });
    ragflow.request.mockResolvedValue([]);

    await expect(
      service.findAllSessions(1, createMockActiveUser(), {}),
    ).resolves.toEqual([]);
  });

  it('shifts ragflow off-by-one reference: chunks misplaced on opener get assigned to a1, doc_aggs derived', async () => {
    ragflow.request.mockResolvedValue([
      {
        id: 's1',
        chat_id: 'rf-1',
        name: '会话 1',
        messages: [
          {
            role: 'assistant',
            content: '你好！',
            reference: [
              fakeChunk('c1', 'doc-A', 'A.docx'),
              fakeChunk('c2', 'doc-A', 'A.docx'),
              fakeChunk('c3', 'doc-B', 'B.docx'),
            ],
          },
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'a1 [ID:0]' },
        ],
      },
    ]);

    const result = await service.findAllSessions(1, createMockActiveUser(), {});

    expect(result).toHaveLength(1);
    expect(result[0]?.messages[0]).not.toHaveProperty('reference');
    const a1 = result[0]?.messages[2];
    expect(a1?.reference?.chunks).toHaveLength(3);
    expect(a1?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('drops reference everywhere when RAGFlow has not yet attached any reference (new session, no completed Q-A)', async () => {
    ragflow.request.mockResolvedValue([
      {
        id: 's2',
        chat_id: 'rf-1',
        name: '空会话',
        messages: [
          { role: 'assistant', content: '你好！' },
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'truncated' },
        ],
      },
    ]);

    const result = await service.findAllSessions(1, createMockActiveUser(), {});
    expect(result[0]?.messages[0]).not.toHaveProperty('reference');
    expect(result[0]?.messages[2]).not.toHaveProperty('reference');
  });
});

describe('assistantService KB prompt template', () => {
  it('does not instruct the model to emit "知识库中未找到您要的答案" — that role is owned by RAGFlow empty_response', () => {
    const prompt = (AssistantService as unknown as { KB_CHAT_PROMPT: string })
      .KB_CHAT_PROMPT;
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain('知识库中未找到您要的答案');
    expect(prompt).toContain('知识库未给出');
  });
});

describe('assistantService default model resolution', () => {
  let service: AssistantService;
  let configGet: ReturnType<typeof vi.fn>;
  let ragflow: {
    getLlmList: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  };
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    configGet = vi.fn().mockReturnValue(undefined);
    ragflow = { request: vi.fn(), getLlmList: vi.fn() };
    prisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();
    service = module.get(AssistantService);
  });

  describe('createGeneral', () => {
    beforeEach(() => {
      prisma.client.assistant.findFirst.mockResolvedValue(null);
      ragflow.request.mockResolvedValue({ id: 'rf-new' });
      prisma.client.assistant.create.mockResolvedValue({ id: 1 });
    });

    it('prefers ASSISTANT_DEFAULT_MODEL when set; skips RAGFlow llm list lookup', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'ASSISTANT_DEFAULT_MODEL' ? 'qwen3@Xinference' : undefined,
      );

      await service.createGeneral(42);

      expect(ragflow.getLlmList).not.toHaveBeenCalled();
      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({ llm_id: 'qwen3@Xinference' }),
      );
      expect(prisma.client.assistant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ modelName: 'qwen3@Xinference' }),
        }),
      );
    });

    it('falls back to first available chat model from RAGFlow llm list when env unset', async () => {
      ragflow.getLlmList.mockResolvedValue([
        {
          available: false,
          fid: 'Xinference',
          llm_name: 'qwen3-unavailable',
          model_type: 'chat',
        },
        {
          available: true,
          fid: 'Xinference',
          llm_name: 'bge-m3',
          model_type: 'embedding',
        },
        {
          available: true,
          fid: 'Xinference',
          llm_name: 'qwen3',
          model_type: 'chat',
        },
        {
          available: true,
          fid: 'Other',
          llm_name: 'second-chat',
          model_type: 'chat',
        },
      ]);

      await service.createGeneral(42);

      expect(ragflow.getLlmList).toHaveBeenCalledTimes(1);
      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({ llm_id: 'qwen3@Xinference' }),
      );
    });

    it('throws ServiceUnavailableException when no available chat model exists and no env override', async () => {
      ragflow.getLlmList.mockResolvedValue([
        {
          available: true,
          fid: 'Xinference',
          llm_name: 'bge-m3',
          model_type: 'embedding',
        },
        {
          available: false,
          fid: 'Xinference',
          llm_name: 'qwen3',
          model_type: 'chat',
        },
      ]);

      await expect(service.createGeneral(42)).rejects.toThrow(
        /未挂载任何可用 chat 模型/,
      );
      expect(ragflow.request).not.toHaveBeenCalled();
      expect(prisma.client.assistant.create).not.toHaveBeenCalled();
    });

    it('returns existing general assistant without resolving model or hitting RAGFlow', async () => {
      prisma.client.assistant.findFirst.mockResolvedValue({
        id: 7,
        userId: 42,
        isGeneral: true,
      });

      const result = await service.createGeneral(42);

      expect(result).toEqual(
        expect.objectContaining({ id: 7, isGeneral: true }),
      );
      expect(ragflow.getLlmList).not.toHaveBeenCalled();
      expect(ragflow.request).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    beforeEach(() => {
      ragflow.request.mockResolvedValue({ id: 'rf-new' });
      prisma.client.assistant.create.mockResolvedValue({ id: 1 });
    });

    it('uses dto.modelName when caller provides it; skips both env and llm list lookup', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'ASSISTANT_DEFAULT_MODEL' ? 'qwen3@Xinference' : undefined,
      );

      await service.create(createMockActiveUser(), {
        name: '我的助手',
        modelName: 'custom-llm@Local',
      } as never);

      expect(configGet).not.toHaveBeenCalledWith('ASSISTANT_DEFAULT_MODEL');
      expect(ragflow.getLlmList).not.toHaveBeenCalled();
      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({ llm_id: 'custom-llm@Local' }),
      );
    });

    it('falls back through env then RAGFlow llm list when dto.modelName missing', async () => {
      ragflow.getLlmList.mockResolvedValue([
        {
          available: true,
          fid: 'Xinference',
          llm_name: 'qwen3',
          model_type: 'chat',
        },
      ]);

      await service.create(createMockActiveUser(), {
        name: '无模型助手',
      } as never);

      expect(ragflow.getLlmList).toHaveBeenCalledTimes(1);
      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({ llm_id: 'qwen3@Xinference' }),
      );
    });
  });
});

describe('assistantService 会话归属（RAGFlow 0.27 起无法在其侧按用户隔离）', () => {
  let service: AssistantService;
  const ragflow = { request: vi.fn() };
  const prisma = createMockPrismaService();

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: ConfigService, useValue: { get: () => 'test-model' } },
      ],
    }).compile();
    service = module.get(AssistantService);

    // 公共助手，创建者是 99；当前用户 sub=1
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      assistantId: 'rf-1',
      deptId: null,
      permission: 'public',
      userId: 99,
    });
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({
      deptId: null,
      id: 1,
      isAdmin: false,
    });
  });

  it('共享助手下只返回自己的会话', async () => {
    prisma.client.assistantSession.findMany.mockResolvedValue([
      { sessionId: 's-mine', userId: 1 },
      { sessionId: 's-other', userId: 2 },
    ]);
    ragflow.request.mockResolvedValue([
      { id: 's-mine', messages: [], name: '我的' },
      { id: 's-other', messages: [], name: '别人的' },
    ]);

    const r = await service.findAllSessions(1, createMockActiveUser(), {});
    expect(r.map((s) => s.id)).toEqual(['s-mine']);
  });

  it('查询不再带 user_id——RAGFlow 会丢弃写入值，按它过滤必然为空', async () => {
    prisma.client.assistantSession.findMany.mockResolvedValue([]);
    ragflow.request.mockResolvedValue([]);

    await service.findAllSessions(1, createMockActiveUser(), {});
    const params = ragflow.request.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(params).not.toHaveProperty('user_id');
  });

  it('归属表上线前的会话回退给助手创建者，不凭空消失', async () => {
    prisma.client.assistantSession.findMany.mockResolvedValue([]);
    ragflow.request.mockResolvedValue([
      { id: 's-legacy', messages: [], name: '旧会话' },
    ]);

    expect(
      await service.findAllSessions(1, createMockActiveUser(), {}),
    ).toEqual([]);
    const asOwner = await service.findAllSessions(
      1,
      createMockActiveUser({ sub: 99 }),
      {},
    );
    expect(asOwner.map((s) => s.id)).toEqual(['s-legacy']);
  });

  it('不能删别人的会话', async () => {
    prisma.client.assistantSession.findMany.mockResolvedValue([
      { sessionId: 's-other', userId: 2 },
    ]);

    await expect(
      service.removeSession(1, createMockActiveUser(), 's-other'),
    ).rejects.toThrow(/无权操作此会话/);
    expect(ragflow.request).not.toHaveBeenCalled();
  });

  it('建会话时登记归属', async () => {
    ragflow.request.mockResolvedValue({ id: 's-new' });

    await service.createSession(1, createMockActiveUser(), {});
    expect(prisma.client.assistantSession.create).toHaveBeenCalledWith({
      data: { assistantId: 1, sessionId: 's-new', userId: 1 },
    });
  });
});
