import { Buffer } from 'node:buffer';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DEFAULT_ASSISTANT_RERANK_CANDIDATES_COUNT } from '@/common/defaults/assistant.defaults';
import { DocxPreprocessService } from '@/common/docx-preprocess/docx-preprocess.service';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import {
  createMockActiveUser,
  createMockFile,
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

// 默认原样透传；需要验证预处理的用例自己改 mockImplementation
const docxPreprocess = {
  preprocessFiles: vi.fn((files: Express.Multer.File[]) =>
    Promise.resolve(files),
  ),
};

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
        { provide: DocxPreprocessService, useValue: docxPreprocess },
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
        { provide: DocxPreprocessService, useValue: docxPreprocess },
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

    it('resolves rerank from the RAGFlow instance when caller omits it and a KB is attached', async () => {
      ragflow.getLlmList.mockResolvedValue([
        {
          available: true,
          fid: 'siliconflow@SILICONFLOW',
          llm_name: 'BAAI/bge-reranker-v2-m3',
          model_type: 'rerank',
        },
      ]);

      await service.create(createMockActiveUser(), {
        datasetIds: ['kb-1'],
        modelName: 'custom-llm@Local',
        name: '带知识库的助手',
      } as never);

      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({
          rerank_id: 'BAAI/bge-reranker-v2-m3@siliconflow@SILICONFLOW',
        }),
      );
    });

    it('leaves rerank off instead of failing when the instance has no rerank model', async () => {
      // 内网那套 RAGFlow 没有 SiliconFlow provider：rerank 缺失只该降级，不该建不出助手
      ragflow.getLlmList.mockResolvedValue([
        {
          available: true,
          fid: 'Xinference',
          llm_name: 'qwen3',
          model_type: 'chat',
        },
      ]);

      await service.create(createMockActiveUser(), {
        datasetIds: ['kb-1'],
        modelName: 'custom-llm@Local',
        name: '无重排实例上的助手',
      } as never);

      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({ rerank_id: '' }),
      );
    });

    // D1（docs/spike-chat-attachment.md §6.1）：空回复非空时，知识库没召回到东西
    // RAGFlow 就直接返回这句话、不调 LLM，用户随问题上传的附件会被整轮无视。
    it('挂知识库的助手默认不设空回复，让附件在空召回时也能参与回答', async () => {
      await service.create(createMockActiveUser(), {
        datasetIds: ['kb-1'],
        modelName: 'custom-llm@Local',
        name: '带知识库的助手',
        rerankId: '',
      } as never);

      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({
          prompt_config: expect.objectContaining({ empty_response: '' }),
        }),
      );
      expect(prisma.client.assistant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ emptyResponse: '' }),
      });
    });

    it('调用方显式给了空回复时照用', async () => {
      await service.create(createMockActiveUser(), {
        datasetIds: ['kb-1'],
        emptyResponse: '没找到',
        modelName: 'custom-llm@Local',
        name: '带知识库的助手',
        rerankId: '',
      } as never);

      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({
          prompt_config: expect.objectContaining({ empty_response: '没找到' }),
        }),
      );
    });

    it('passes rerankId through to RAGFlow as rerank_id and persists it', async () => {
      await service.create(createMockActiveUser(), {
        modelName: 'custom-llm@Local',
        name: '带重排的助手',
        rerankId: 'BAAI/bge-reranker-v2-m3@siliconflow@SILICONFLOW',
      } as never);

      expect(ragflow.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/chats',
        expect.objectContaining({
          rerank_id: 'BAAI/bge-reranker-v2-m3@siliconflow@SILICONFLOW',
        }),
      );
      expect(prisma.client.assistant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rerankId: 'BAAI/bge-reranker-v2-m3@siliconflow@SILICONFLOW',
          }),
        }),
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
        { provide: DocxPreprocessService, useValue: docxPreprocess },
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
    // RAGFlow 的 REST_API_MAX_PAGE_SIZE=100，超了它直接抛 ValueError
    expect(params?.page_size as number).toBeLessThanOrEqual(100);
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

describe('assistantService.update 推给 RAGFlow 的检索参数', () => {
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
        { provide: DocxPreprocessService, useValue: docxPreprocess },
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
    prisma.client.assistant.update.mockResolvedValue({ id: 1 });
    ragflow.request.mockResolvedValue({});
  });

  // PUT 是整体替换：漏掉 rerank_candidates_count，RAGFlow 会把它重置回默认的 64，
  // 于是一次无关的编辑保存就悄悄把召回上限从 128 削掉一半。
  it('带上 rerank_candidates_count，不让 RAGFlow 把它重置回 64', async () => {
    await service.update(createMockActiveUser(), 1, {
      name: '改个名字',
    } as never);

    expect(ragflow.request).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/chats/rf-1',
      expect.objectContaining({
        rerank_candidates_count: DEFAULT_ASSISTANT_RERANK_CANDIDATES_COUNT,
      }),
    );
  });
});

describe('assistantService 对话附件', () => {
  let service: AssistantService;
  const ragflow = {
    request: vi.fn(),
    requestStream: vi.fn(),
    uploadFile: vi.fn(),
  };
  const prisma = createMockPrismaService();

  // 当前用户 sub=1；公共助手，创建者 99；会话 s1 归当前用户
  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: ConfigService, useValue: { get: () => 'test-model' } },
        { provide: DocxPreprocessService, useValue: docxPreprocess },
      ],
    }).compile();
    service = module.get(AssistantService);

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
    prisma.client.assistantSession.findMany.mockResolvedValue([
      { sessionId: 's1', userId: 1 },
      { sessionId: 's-other', userId: 2 },
    ]);
  });

  describe('uploadAttachments', () => {
    const pdf = () =>
      createMockFile({
        originalname: Buffer.from('报告.pdf', 'utf8').toString('latin1'),
        mimetype: 'application/pdf',
        size: 10,
      });

    beforeEach(() => {
      ragflow.uploadFile.mockResolvedValue({
        id: 'f1',
        name: '报告.pdf',
        size: 10,
        mime_type: 'application/pdf',
        created_by: 'tenant-1',
      });
      prisma.client.assistantAttachment.createMany.mockResolvedValue({
        count: 1,
      });
    });

    it('看不到的助手直接拒绝，不上传', async () => {
      prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        assistantId: 'rf-1',
        deptId: null,
        permission: 'me',
        userId: 99,
      });

      await expect(
        service.uploadAttachments(1, createMockActiveUser(), 's1', [pdf()]),
      ).rejects.toThrow(/无权访问此助手/);
      expect(ragflow.uploadFile).not.toHaveBeenCalled();
    });

    it('别人的会话直接拒绝，不上传', async () => {
      await expect(
        service.uploadAttachments(1, createMockActiveUser(), 's-other', [
          pdf(),
        ]),
      ).rejects.toThrow(/无权操作此会话/);
      expect(ragflow.uploadFile).not.toHaveBeenCalled();
    });

    it('没有文件时报 400', async () => {
      await expect(
        service.uploadAttachments(1, createMockActiveUser(), 's1', []),
      ).rejects.toThrow(/请选择/);
    });

    it('上传到 RAGFlow 的临时文件接口并登记归属', async () => {
      const result = await service.uploadAttachments(
        1,
        createMockActiveUser(),
        's1',
        [pdf()],
      );

      expect(ragflow.uploadFile).toHaveBeenCalledWith(
        '/api/v1/documents/upload',
        expect.any(FormData),
      );
      const form = ragflow.uploadFile.mock.calls[0]?.[1] as FormData;
      // multer 把 UTF-8 文件名按 latin1 解出来，要转回去
      expect((form.getAll('file')[0] as File).name).toBe('报告.pdf');

      expect(prisma.client.assistantAttachment.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              fileId: 'f1',
              assistantId: 1,
              sessionId: 's1',
              userId: 1,
              name: '报告.pdf',
              mimeType: 'application/pdf',
              size: 10,
              createdBy: 'tenant-1',
            },
          ],
        },
      );
      expect(result).toEqual([
        { id: 'f1', name: '报告.pdf', mimeType: 'application/pdf', size: 10 },
      ]);
    });

    it('多个文件时 RAGFlow 返回数组，逐个登记', async () => {
      ragflow.uploadFile.mockResolvedValue([
        {
          id: 'f1',
          name: 'a.md',
          size: 1,
          mime_type: 'text/markdown',
          created_by: 't',
        },
        {
          id: 'f2',
          name: 'b.txt',
          size: 2,
          mime_type: 'text/plain',
          created_by: 't',
        },
      ]);

      const result = await service.uploadAttachments(
        1,
        createMockActiveUser(),
        's1',
        [
          createMockFile({ originalname: 'a.md', mimetype: 'text/markdown' }),
          createMockFile({ originalname: 'b.txt', mimetype: 'text/plain' }),
        ],
      );

      expect(result.map((r) => r.id)).toEqual(['f1', 'f2']);
      expect(
        prisma.client.assistantAttachment.createMany.mock.calls[0]?.[0].data,
      ).toHaveLength(2);
    });

    it('docx 先经 pandoc 预处理再上传', async () => {
      const md = createMockFile({
        originalname: 'a.md',
        mimetype: 'text/markdown',
      });
      docxPreprocess.preprocessFiles.mockResolvedValueOnce([md]);

      await service.uploadAttachments(1, createMockActiveUser(), 's1', [
        createMockFile({ originalname: 'a.docx' }),
      ]);

      const form = ragflow.uploadFile.mock.calls[0]?.[1] as FormData;
      expect((form.getAll('file')[0] as File).name).toBe('a.md');
    });
  });

  describe('completions 组装 files', () => {
    const res = () => ({
      json: vi.fn((body: unknown) => body),
      on: vi.fn(),
      setHeader: vi.fn(),
    });
    const sentBody = () => ragflow.request.mock.calls[0]?.[2] as object;

    beforeEach(() => {
      ragflow.request.mockResolvedValue({ answer: 'ok' });
    });

    it('没有附件时请求体与原来逐字一致（非流式）', async () => {
      await service.completions(
        1,
        createMockActiveUser(),
        { question: 'q', sessionId: 's1', stream: false },
        res() as never,
      );

      expect(JSON.stringify(sentBody())).toBe(
        JSON.stringify({
          chat_id: 'rf-1',
          question: 'q',
          stream: false,
          session_id: 's1',
          user_id: '1',
        }),
      );
      expect(prisma.client.assistantAttachment.findMany).not.toHaveBeenCalled();
    });

    it('没有附件时请求体与原来逐字一致（流式）', async () => {
      const stream = { on: vi.fn(), pipe: vi.fn(), destroy: vi.fn() };
      ragflow.requestStream.mockResolvedValue(stream);

      await service.completions(
        1,
        createMockActiveUser(),
        { question: 'q', sessionId: 's1', attachmentIds: [] },
        res() as never,
      );

      expect(JSON.stringify(ragflow.requestStream.mock.calls[0]?.[2])).toBe(
        JSON.stringify({
          chat_id: 'rf-1',
          question: 'q',
          stream: true,
          session_id: 's1',
          user_id: '1',
        }),
      );
      expect(prisma.client.assistantAttachment.findMany).not.toHaveBeenCalled();
    });

    it('只按「本人 + 本会话 + 本助手」查附件', async () => {
      prisma.client.assistantAttachment.findMany.mockResolvedValue([]);

      await service
        .completions(
          1,
          createMockActiveUser(),
          {
            question: 'q',
            sessionId: 's1',
            stream: false,
            attachmentIds: ['f1'],
          },
          res() as never,
        )
        .catch(() => undefined);

      expect(prisma.client.assistantAttachment.findMany).toHaveBeenCalledWith({
        where: {
          fileId: { in: ['f1'] },
          userId: 1,
          sessionId: 's1',
          assistantId: 1,
        },
      });
    });

    // 归属表按 userId + sessionId 过滤，别人的 / 别的会话的附件查不出来，数量就对不上
    it('别人的附件或别的会话的附件：数量对不上返回 403，不调 RAGFlow', async () => {
      prisma.client.assistantAttachment.findMany.mockResolvedValue([
        {
          fileId: 'f1',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          createdBy: 't',
        },
      ]);

      await expect(
        service.completions(
          1,
          createMockActiveUser(),
          {
            question: 'q',
            sessionId: 's1',
            stream: false,
            attachmentIds: ['f1', 'f-not-mine'],
          },
          res() as never,
        ),
      ).rejects.toThrow(/无权使用/);
      expect(ragflow.request).not.toHaveBeenCalled();
      expect(ragflow.requestStream).not.toHaveBeenCalled();
    });

    it('带附件却没给会话时拒绝', async () => {
      await expect(
        service.completions(
          1,
          createMockActiveUser(),
          { question: 'q', stream: false, attachmentIds: ['f1'] },
          res() as never,
        ),
      ).rejects.toThrow(/会话/);
      expect(ragflow.request).not.toHaveBeenCalled();
    });

    it('在服务端组装 files，流式和非流式都带上', async () => {
      prisma.client.assistantAttachment.findMany.mockResolvedValue([
        {
          fileId: 'f2',
          name: 'b.md',
          mimeType: 'text/markdown',
          createdBy: 't',
        },
        {
          fileId: 'f1',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          createdBy: 't',
        },
      ]);
      const expected = [
        {
          id: 'f1',
          name: 'a.pdf',
          mime_type: 'application/pdf',
          created_by: 't',
        },
        { id: 'f2', name: 'b.md', mime_type: 'text/markdown', created_by: 't' },
      ];
      const dto = {
        question: 'q',
        sessionId: 's1',
        attachmentIds: ['f1', 'f2'],
      };

      await service.completions(
        1,
        createMockActiveUser(),
        { ...dto, stream: false },
        res() as never,
      );
      expect(sentBody()).toEqual({
        chat_id: 'rf-1',
        question: 'q',
        stream: false,
        session_id: 's1',
        user_id: '1',
        files: expected,
      });

      ragflow.requestStream.mockResolvedValue({
        on: vi.fn(),
        pipe: vi.fn(),
        destroy: vi.fn(),
      });
      await service.completions(1, createMockActiveUser(), dto, res() as never);
      expect(ragflow.requestStream.mock.calls[0]?.[2]).toMatchObject({
        stream: true,
        files: expected,
      });
    });
  });

  it('删会话时一并删掉它的附件记录', async () => {
    ragflow.request.mockResolvedValue({});

    await service.removeSession(1, createMockActiveUser(), 's1');

    expect(prisma.client.assistantAttachment.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: 's1' },
    });
  });
});
