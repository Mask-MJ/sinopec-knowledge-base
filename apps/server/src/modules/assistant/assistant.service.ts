import type {
  CreateAssistantDto,
  CreateCompletionsDto,
  CreateSessionDto,
  QueryAssistantDto,
  QuerySessionDto,
  UpdateAssistantDto,
  UpdateSessionDto,
} from './assistant.dto';
import type { PrismaService } from '@/common/database/prisma.extension';
import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';
import type { Response } from 'express';

import { Transform } from 'node:stream';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { RagflowService } from '@/common/ragflow/ragflow.service';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
  ) {}

  // ─── Private Helpers ──────────────────────────────

  private async assertOwnership(id: number, user: ActiveUserData) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    if (userData.isAdmin) return assistant;
    if (assistant.userId !== user.sub) {
      throw new ForbiddenException('无权操作此助手');
    }
    return assistant;
  }

  // ─── Completion (SSE 中间层) ──────────────────────

  async completions(
    id: number,
    user: ActiveUserData,
    dto: CreateCompletionsDto,
    res: Response,
  ) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    // 非流式模式：返回 JSON
    if (dto.stream === false) {
      const result = await this.ragflow.request(
        'POST',
        `/api/v1/chats/${assistant.assistantId}/completions`,
        {
          question: dto.question,
          stream: false,
          session_id: dto.sessionId,
          user_id: String(user.sub),
        },
      );
      return res.json(result);
    }

    // 流式模式：SSE
    const ragflowStream = await this.ragflow.requestStream(
      'POST',
      `/api/v1/chats/${assistant.assistantId}/completions`,
      {
        question: dto.question,
        stream: true,
        session_id: dto.sessionId,
        user_id: String(user.sub),
      },
    );

    const transformStream = new Transform({
      transform(chunk, _encoding, callback) {
        this.push(chunk.toString());
        callback();
      },
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    ragflowStream.on('error', (err) => {
      this.logger.error('RAGFlow SSE 流异常', err);
      if (res.headersSent) {
        res.end();
      } else {
        res.status(503).json({ message: 'RAGFlow 服务异常' });
      }
    });

    transformStream.on('error', (err) => {
      this.logger.error('Transform 流异常', err);
      res.end();
    });

    res.on('close', () => {
      ragflowStream.destroy();
    });

    ragflowStream.pipe(transformStream).pipe(res);
  }

  // ─── Assistant CRUD ──────────────────────────────

  async create(user: ActiveUserData, dto: CreateAssistantDto) {
    const ragflowData = await this.ragflow.request<{ id: string }>(
      'POST',
      '/api/v1/chats',
      {
        name: dto.name,
        avatar: dto.avatar,
        description: dto.description,
        dataset_ids: dto.datasetIds,
        llm: {
          model_name: dto.modelName,
          temperature: dto.temperature,
          top_p: dto.topP,
          presence_penalty: dto.presencePenalty,
          frequency_penalty: dto.frequencyPenalty,
          max_tokens: dto.maxTokens,
        },
        prompt: {
          opener: dto.opener,
          prompt: dto.prompt,
          empty_response: dto.emptyResponse,
          similarity_threshold: dto.similarityThreshold,
          keywords_similarity_weight: dto.keywordsSimilarityWeight,
          top_n: dto.topN,
        },
        top_k: dto.topK,
      },
    );

    try {
      return await this.prisma.client.assistant.create({
        data: {
          name: dto.name,
          avatar: dto.avatar,
          description: dto.description,
          assistantId: ragflowData.id,
          modelName: dto.modelName,
          temperature: dto.temperature,
          topP: dto.topP,
          presencePenalty: dto.presencePenalty,
          frequencyPenalty: dto.frequencyPenalty,
          maxTokens: dto.maxTokens,
          similarityThreshold: dto.similarityThreshold,
          keywordsSimilarityWeight: dto.keywordsSimilarityWeight,
          topN: dto.topN,
          topK: dto.topK,
          emptyResponse: dto.emptyResponse,
          opener: dto.opener,
          prompt: dto.prompt,
          datasetIds: dto.datasetIds ?? [],
          userId: user.sub,
        },
      });
    } catch (error) {
      this.logger.error(
        `DB 写入失败，回滚 RAGFlow 助手: ${ragflowData.id}`,
        error,
      );
      try {
        await this.ragflow.request('DELETE', '/api/v1/chats', {
          ids: [ragflowData.id],
        });
        this.logger.log(`RAGFlow 助手 ${ragflowData.id} 已成功回滚`);
      } catch (rollbackError) {
        this.logger.error(
          `RAGFlow 回滚失败，孤儿助手: ${ragflowData.id}`,
          rollbackError,
        );
      }
      throw error;
    }
  }

  async createSession(id: number, user: ActiveUserData, dto: CreateSessionDto) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return this.ragflow.request(
      'POST',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        name: dto.name ?? '新会话',
        user_id: String(user.sub),
      },
    );
  }

  async findAll(user: ActiveUserData, dto: QueryAssistantDto) {
    const { name, current, pageSize } = dto;
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });

    const where = userData.isAdmin
      ? { name: { contains: name, mode: 'insensitive' as const } }
      : {
          name: { contains: name, mode: 'insensitive' as const },
          userId: user.sub,
        };

    const [list, meta] = await this.prisma.client.assistant
      .paginate({ where })
      .withPages({ page: current, limit: pageSize, includePageCount: true });

    return { list, ...meta };
  }

  async findAllSessions(
    id: number,
    user: ActiveUserData,
    dto: QuerySessionDto,
  ) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return this.ragflow.request(
      'GET',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        page: dto.page ?? 1,
        page_size: dto.pageSize ?? 30,
        user_id: String(user.sub),
        name: dto.name,
      },
    );
  }

  async findOne(id: number, user: ActiveUserData) {
    return this.assertOwnership(id, user);
  }

  async remove(id: number, user: ActiveUserData) {
    const assistant = await this.assertOwnership(id, user);

    // DB-first
    const deleted = await this.prisma.client.assistant.delete({
      where: { id },
    });

    if (assistant.assistantId) {
      try {
        await this.ragflow.request('DELETE', '/api/v1/chats', {
          ids: [assistant.assistantId],
        });
      } catch (error) {
        this.logger.error(
          `RAGFlow 助手清理失败 (assistantId: ${assistant.assistantId})，需人工清理`,
          error,
        );
      }
    }

    return deleted;
  }

  async removeSession(id: number, user: ActiveUserData, sessionId: string) {
    const assistant = await this.assertOwnership(id, user);

    return this.ragflow.request(
      'DELETE',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      { ids: [sessionId] },
    );
  }

  async update(user: ActiveUserData, id: number, dto: UpdateAssistantDto) {
    const assistant = await this.assertOwnership(id, user);

    // DB-first
    const updated = await this.prisma.client.assistant.update({
      where: { id },
      data: {
        name: dto.name,
        avatar: dto.avatar,
        description: dto.description,
        modelName: dto.modelName,
        temperature: dto.temperature,
        topP: dto.topP,
        presencePenalty: dto.presencePenalty,
        frequencyPenalty: dto.frequencyPenalty,
        maxTokens: dto.maxTokens,
        similarityThreshold: dto.similarityThreshold,
        keywordsSimilarityWeight: dto.keywordsSimilarityWeight,
        topN: dto.topN,
        topK: dto.topK,
        emptyResponse: dto.emptyResponse,
        opener: dto.opener,
        prompt: dto.prompt,
        datasetIds: dto.datasetIds,
      },
    });

    if (assistant.assistantId) {
      try {
        await this.ragflow.request(
          'PUT',
          `/api/v1/chats/${assistant.assistantId}`,
          {
            name: dto.name,
            avatar: dto.avatar,
            description: dto.description,
            dataset_ids: dto.datasetIds,
            llm: {
              model_name: dto.modelName,
              frequency_penalty: dto.frequencyPenalty,
              max_tokens: dto.maxTokens,
              presence_penalty: dto.presencePenalty,
              temperature: dto.temperature,
              top_p: dto.topP,
            },
            prompt: {
              empty_response: dto.emptyResponse,
              keywords_similarity_weight: dto.keywordsSimilarityWeight,
              opener: dto.opener,
              prompt: dto.prompt,
              similarity_threshold: dto.similarityThreshold,
              top_n: dto.topN,
            },
            top_k: dto.topK,
          },
        );
      } catch (error) {
        this.logger.error(`RAGFlow 同步失败，回滚本地 DB (id: ${id})`, error);
        await this.prisma.client.assistant.update({
          where: { id },
          data: {
            name: assistant.name,
            avatar: assistant.avatar,
            description: assistant.description,
            modelName: assistant.modelName,
            temperature: assistant.temperature,
            topP: assistant.topP,
            presencePenalty: assistant.presencePenalty,
            frequencyPenalty: assistant.frequencyPenalty,
            maxTokens: assistant.maxTokens,
            similarityThreshold: assistant.similarityThreshold,
            keywordsSimilarityWeight: assistant.keywordsSimilarityWeight,
            topN: assistant.topN,
            topK: assistant.topK,
            emptyResponse: assistant.emptyResponse,
            opener: assistant.opener,
            prompt: assistant.prompt,
            datasetIds: assistant.datasetIds,
          },
        });
        throw error;
      }
    }

    return updated;
  }

  async updateSession(id: number, sessionId: string, dto: UpdateSessionDto) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    await this.ragflow.request(
      'PUT',
      `/api/v1/chats/${assistant.assistantId}/sessions/${sessionId}`,
      { name: dto.name },
    );

    return { message: '更新会话成功' };
  }
}
