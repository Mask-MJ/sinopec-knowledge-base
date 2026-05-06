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
    });
  });

  it('normalizes flat chunk[] reference into { chunks, doc_aggs } per assistant message', async () => {
    ragflow.request.mockResolvedValue([
      {
        id: 's1',
        chat_id: 'rf-1',
        name: '会话 1',
        messages: [
          { role: 'assistant', content: '你好！' },
          { role: 'user', content: 'q1' },
          {
            role: 'assistant',
            content: 'a1 [ID:0]',
            reference: [
              fakeChunk('c1', 'doc-A', 'A.docx'),
              fakeChunk('c2', 'doc-A', 'A.docx'),
              fakeChunk('c3', 'doc-B', 'B.docx'),
            ],
          },
        ],
      },
    ]);

    const result = await service.findAllSessions(1, createMockActiveUser(), {});

    expect(result).toHaveLength(1);
    const a1 = result[0]?.messages[2];
    expect(a1?.reference?.chunks).toHaveLength(3);
    expect(a1?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('drops reference field for assistant messages where RAGFlow truncated persistence', async () => {
    ragflow.request.mockResolvedValue([
      {
        id: 's2',
        chat_id: 'rf-1',
        name: '截断会话',
        messages: [
          { role: 'assistant', content: '你好！' },
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'truncated' },
        ],
      },
    ]);

    const result = await service.findAllSessions(1, createMockActiveUser(), {});
    expect(result[0]?.messages[2]).not.toHaveProperty('reference');
  });
});

describe('AssistantService KB prompt template', () => {
  it('does not instruct the model to emit "知识库中未找到您要的答案" — that role is owned by RAGFlow empty_response', () => {
    const prompt = (
      AssistantService as unknown as { KB_CHAT_PROMPT: string }
    ).KB_CHAT_PROMPT;
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain('知识库中未找到您要的答案');
    expect(prompt).toContain('知识库未给出');
  });
});
