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

import { Buffer } from 'node:buffer';
import { Transform } from 'node:stream';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { RagflowService } from '@/common/ragflow/ragflow.service';

@Injectable()
export class AssistantService {
  /** 关联知识库时的默认空回复 */
  private static readonly DEFAULT_EMPTY_RESPONSE = '知识库中未找到您要的答案！';

  /** 通用助手默认模型名称（后备值） — 优先取环境变量 ASSISTANT_DEFAULT_MODEL */
  private static readonly DEFAULT_MODEL_NAME_FALLBACK = 'gpt-oss@Xinference';

  // ─── Private Helpers ──────────────────────────────

  /** 默认开场白 */
  private static readonly DEFAULT_OPENER =
    '你好！我是你的助理，有什么可以帮到你的吗？';

  /** 通用聊天（无知识库）的默认系统提示词 */
  private static readonly GENERAL_CHAT_PROMPT =
    '你是一个智能助手。请直接回答用户的问题，提供准确、有帮助的信息。\n{knowledge}';

  /** 关联知识库时的默认系统提示词（与 RAGFlow 保持一致） */
  private static readonly KB_CHAT_PROMPT = [
    '你是一个智能助手，请总结知识库的内容来回答问题，请列举知识库中的数据详细回答。',
    '当所有知识库内容都与问题无关时，你的回答必须包括"知识库中未找到您要的答案！"这句话。',
    '回答需要考虑聊天历史。',
    '以下是知识库：',
    '{knowledge}',
    '以上是知识库。',
  ].join('\n');

  // ─── Completion (SSE 中间层) ──────────────────────

  private readonly defaultModelName: string;

  private readonly logger = new Logger(AssistantService.name);

  // ─── Assistant CRUD ──────────────────────────────

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
    configService: ConfigService,
  ) {
    this.defaultModelName = configService.get<string>(
      'ASSISTANT_DEFAULT_MODEL',
      AssistantService.DEFAULT_MODEL_NAME_FALLBACK,
    );
  }

  /**
   * 将已解析的值映射为 RAGFlow prompt_config 格式
   * 字段映射：prompt → system, opener → prologue
   * 调用方负责提供已填入默认值的参数，此方法不做默认值回退
   */
  private static toPromptConfig(resolved: {
    emptyResponse: string;
    hasKnowledgeBase: boolean;
    opener: string;
    prompt: string;
  }): Record<string, unknown> {
    return {
      system: resolved.prompt,
      prologue: resolved.opener,
      parameters: [{ key: 'knowledge', optional: false }],
      empty_response: resolved.emptyResponse,
      quote: resolved.hasKnowledgeBase,
    };
  }

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
      transform(chunk: Buffer | string, _encoding, callback) {
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

  async create(user: ActiveUserData, dto: CreateAssistantDto) {
    const modelName = dto.modelName || this.defaultModelName;
    const hasKnowledgeBase = !!(dto.datasetIds && dto.datasetIds.length > 0);
    const prompt =
      dto.prompt ||
      (hasKnowledgeBase
        ? AssistantService.KB_CHAT_PROMPT
        : AssistantService.GENERAL_CHAT_PROMPT);
    const opener = dto.opener || AssistantService.DEFAULT_OPENER;
    const emptyResponse = hasKnowledgeBase
      ? dto.emptyResponse || AssistantService.DEFAULT_EMPTY_RESPONSE
      : (dto.emptyResponse ?? '');

    const ragflowData = await this.ragflow.request<{ id: string }>(
      'POST',
      '/api/v1/chats',
      {
        name: dto.name,
        icon: dto.avatar,
        description: dto.description,
        dataset_ids: dto.datasetIds,
        llm_id: modelName,
        llm_setting: {
          temperature: dto.temperature,
          top_p: dto.topP,
          presence_penalty: dto.presencePenalty,
          frequency_penalty: dto.frequencyPenalty,
          max_tokens: dto.maxTokens,
        },
        prompt_config: AssistantService.toPromptConfig({
          prompt,
          opener,
          emptyResponse,
          hasKnowledgeBase,
        }),
        similarity_threshold: dto.similarityThreshold,
        vector_similarity_weight: dto.keywordsSimilarityWeight,
        top_n: dto.topN,
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
          modelName,
          temperature: dto.temperature,
          topP: dto.topP,
          presencePenalty: dto.presencePenalty,
          frequencyPenalty: dto.frequencyPenalty,
          maxTokens: dto.maxTokens,
          similarityThreshold: dto.similarityThreshold,
          keywordsSimilarityWeight: dto.keywordsSimilarityWeight,
          topN: dto.topN,
          topK: dto.topK,
          emptyResponse,
          opener,
          prompt,
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

  /**
   * 为指定用户获取或创建通用助手（无知识库关联）
   * 幂等：若已存在直接返回，并发创建时通过捕获唯一约束冲突保证安全
   */
  async createGeneral(userId: number) {
    const existing = await this.prisma.client.assistant.findFirst({
      where: { userId, isGeneral: true },
    });
    if (existing) return existing;

    const ragflowData = await this.ragflow.request<{ id: string }>(
      'POST',
      '/api/v1/chats',
      {
        name: '通用助手',
        description: '通用 AI 对话助手',
        dataset_ids: [],
        llm_id: this.defaultModelName,
        prompt_config: AssistantService.toPromptConfig({
          prompt: AssistantService.GENERAL_CHAT_PROMPT,
          opener: AssistantService.DEFAULT_OPENER,
          emptyResponse: '',
          hasKnowledgeBase: false,
        }),
      },
    );

    try {
      return await this.prisma.client.assistant.create({
        data: {
          name: '通用助手',
          description: '通用 AI 对话助手',
          assistantId: ragflowData.id,
          modelName: this.defaultModelName,
          isGeneral: true,
          userId,
        },
      });
    } catch (error) {
      // 并发创建时可能重复，查询已存在的记录返回
      const fallback = await this.prisma.client.assistant.findFirst({
        where: { userId, isGeneral: true },
      });
      if (fallback) return fallback;
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
            icon: dto.avatar,
            description: dto.description,
            dataset_ids: dto.datasetIds,
            llm_id: dto.modelName,
            llm_setting: {
              temperature: dto.temperature,
              top_p: dto.topP,
              presence_penalty: dto.presencePenalty,
              frequency_penalty: dto.frequencyPenalty,
              max_tokens: dto.maxTokens,
            },
            prompt_config: AssistantService.toPromptConfig({
              prompt: dto.prompt ?? '',
              opener: dto.opener ?? '',
              emptyResponse: dto.emptyResponse ?? '',
              hasKnowledgeBase: !!(dto.datasetIds && dto.datasetIds.length > 0),
            }),
            similarity_threshold: dto.similarityThreshold,
            vector_similarity_weight: dto.keywordsSimilarityWeight,
            top_n: dto.topN,
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
}
