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

import { Inject, Injectable, Logger } from '@nestjs/common';

import { RagflowService } from '@/common/ragflow/ragflow.service';

/** 透传查询时默认最大页大小 */
const MAX_PAGE_SIZE = 100_000;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
  ) {}

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

    const ragflowStream = await this.ragflow.requestStream(
      'POST',
      `/api/v1/chats/${assistant.assistantId}/completions`,
      {
        question: dto.question,
        stream: dto.stream ?? true,
        session_id: dto.sessionId,
        user_id: String(user.sub),
      },
    );

    // Transform 流：逐 chunk 解析 + 钩子插入点
    const transformStream = new Transform({
      transform(chunk, _encoding, callback) {
        const text = chunk.toString();
        // 透传到前端（零延迟）
        this.push(text);

        // ─── 钩子插入点 ───
        // 这里可以：
        // 1. 解析 SSE data: 行 → JSON.parse → 记录日志
        // 2. 统计 token 用量
        // 3. 过滤敏感词
        // 目前仅做透传，后续可以扩展

        callback();
      },
    });

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 流错误处理
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

    // 客户端断开时清理上游流
    res.on('close', () => {
      ragflowStream.destroy();
    });

    ragflowStream.pipe(transformStream).pipe(res);
  }

  // ─── Assistant CRUD ──────────────────────────────

  async create(user: ActiveUserData, dto: CreateAssistantDto) {
    // 先写本地 DB
    const assistant = await this.prisma.client.assistant.create({
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
        userId: user.sub,
      },
    });

    try {
      // 再调 RAGFlow
      const ragflowData = await this.ragflow.request<{ id: string }>(
        'POST',
        '/api/v1/chats',
        { name: dto.name },
      );

      // 回写 RAGFlow 返回的 assistantId
      return await this.prisma.client.assistant.update({
        where: { id: assistant.id },
        data: { assistantId: ragflowData.id },
      });
    } catch (error) {
      // 回滚本地 DB（回滚本身也做容错）
      try {
        await this.prisma.client.assistant.delete({
          where: { id: assistant.id },
        });
      } catch (rollbackError) {
        this.logger.error('助手回滚失败，数据可能不一致', rollbackError);
      }
      throw error;
    }
  }

  async createSession(id: number, user: ActiveUserData, dto: CreateSessionDto) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'POST',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        name: dto.name ?? '新会话',
        user_id: String(user.sub),
      },
    );
  }

  async findAll(user: ActiveUserData, dto: QueryAssistantDto) {
    const { name } = dto;
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });

    if (userData.isAdmin) {
      return await this.prisma.client.assistant.findMany({
        where: { name: { contains: name, mode: 'insensitive' } },
      });
    }

    return await this.prisma.client.assistant.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        userId: user.sub,
      },
    });
  }

  async findAllSessions(
    id: number,
    user: ActiveUserData,
    dto: QuerySessionDto,
  ) {
    const { name: _name } = dto;
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'GET',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        page: 1,
        page_size: MAX_PAGE_SIZE,
        user_id: String(user.sub),
      },
    );
  }

  async findOne(id: number) {
    return await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });
  }

  async remove(id: number) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    if (assistant.assistantId) {
      await this.ragflow.request('DELETE', '/api/v1/chats', {
        ids: [assistant.assistantId],
      });
    }

    return await this.prisma.client.assistant.delete({ where: { id } });
  }

  async removeSession(id: number, sessionId: string) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'DELETE',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      { ids: [sessionId] },
    );
  }

  async update(_user: ActiveUserData, id: number, dto: UpdateAssistantDto) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    if (assistant.assistantId) {
      await this.ragflow.request(
        'PUT',
        `/api/v1/chats/${assistant.assistantId}`,
        {
          name: dto.name,
          avatar: dto.avatar,
          description: dto.description,
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
    }

    return await this.prisma.client.assistant.update({
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
      },
    });
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
