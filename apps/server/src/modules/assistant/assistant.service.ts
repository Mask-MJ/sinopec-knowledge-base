import type {
  CreateAssistantDto,
  CreateCompletionsDto,
  CreateSessionDto,
  QueryAssistantDto,
  QuerySessionDto,
  UpdateAssistantDto,
  UpdateSessionDto,
} from './assistant.dto';
import type { RagflowRawMessage } from './normalize-reference';
import type { PrismaService } from '@/common/database/prisma.extension';
import type { RagflowLlmItem } from '@/common/ragflow/ragflow.service';
import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';
import type { Response } from 'express';

import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DEFAULT_ASSISTANT_RERANK_ID } from '@/common/defaults/assistant.defaults';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import {
  assertCanShareAs,
  buildVisibilityWhere,
  canEditResource,
  canViewResource,
} from '@/modules/auth/authorization/resource-visibility';

import { normalizeMessageReferences } from './normalize-reference';

interface RagflowSessionRaw {
  chat_id: string;
  create_date: string;
  id: string;
  messages: RagflowRawMessage[];
  name: string;
  update_date: string;
}

@Injectable()
export class AssistantService {
  private static readonly DEFAULT_EMPTY_RESPONSE = '知识库中未找到您要的答案！';

  /** 默认开场白 */
  private static readonly DEFAULT_OPENER =
    '你好！我是你的助理，有什么可以帮到你的吗？';

  // ─── Private Helpers ──────────────────────────────

  /** 通用聊天（无知识库）的默认系统提示词 */
  private static readonly GENERAL_CHAT_PROMPT =
    '你是一个智能助手。请直接回答用户的问题，提供准确、有帮助的信息。\n{knowledge}';

  /** 关联知识库时的默认系统提示词（针对中石化勘探技术报告场景） */
  private static readonly KB_CHAT_PROMPT = [
    '你是中石化勘探技术报告专业助手。根据知识库内容回答问题，遵守以下规则：',
    '',
    '1. **列举类问题必须完整**：当用户问"哪些参数 / 主要参数 / 工作量包括 / 影响因素有哪些 / 包括..等"时，必须列出知识库中提及的**全部条目**，不要省略。',
    '2. **数字必须精确严格**：所有数字（井号、坐标、限差、面积、覆盖次数、炮数、控制点编号等）必须照实给出，包含正负号和单位。',
    '3. **区分试验段 vs 全工区**：当问"实际生产 / 总数 / 全项目"时，必须找**全工区/全项目的汇总数据**；问"试验段 / 局部"才用试验段数据。如果两者在知识库中都有，必须**分别回答**并明确区分。',
    '4. **多文档汇总**：同一项目跨多份文档（如工程设计 + 测量施工总结 + 试验报告），需要从多源汇总，不要遗漏。',
    '5. **不知道就说不知道**：知识库未提及的事实绝不编造，明确说"知识库未给出"。',
    '6. **回答结构化**：使用编号列表、bullet point 或表格，便于核对每个数据点。',
    '',
    '知识库内容：',
    '{knowledge}',
  ].join('\n');

  /** 关联知识库时的默认空回复 */
  /**
   * 单次从 RAGFlow 取回的会话上限，取回后本地按归属过滤。
   * 不能超过 RAGFlow 的 REST_API_MAX_PAGE_SIZE(=100)，否则它直接抛
   * `page_size must be less than or equal to 100`。
   */
  private static readonly SESSION_FETCH_LIMIT = 100;

  // ─── Completion (SSE 中间层) ──────────────────────

  private readonly logger = new Logger(AssistantService.name);

  // ─── Assistant CRUD ──────────────────────────────

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
    private readonly configService: ConfigService,
  ) {}

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
    const assistant = await this.assertCanView(id, user);

    // 非流式模式：返回 JSON
    if (dto.stream === false) {
      const result = await this.ragflow.request(
        'POST',
        '/api/v1/chat/completions',
        {
          chat_id: assistant.assistantId,
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
      '/api/v1/chat/completions',
      {
        chat_id: assistant.assistantId,
        question: dto.question,
        stream: true,
        session_id: dto.sessionId,
        user_id: String(user.sub),
      },
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // 显式关 Express compression / proxy buffering：SSE 必须立即 flush
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    ragflowStream.on('error', (err) => {
      this.logger.error('RAGFlow SSE 流异常', err);
      if (res.headersSent) {
        res.end();
      } else {
        res.status(503).json({ message: 'RAGFlow 服务异常' });
      }
    });

    res.on('close', () => {
      ragflowStream.destroy();
    });

    // 透明 pipe：保留 Buffer 类型，避免不必要的 toString 中间层和潜在的
    // chunk 边界问题。SSE 是字节流，浏览器 fetch ReadableStream 自己 decode。
    ragflowStream.pipe(res);
  }

  async create(user: ActiveUserData, dto: CreateAssistantDto) {
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    assertCanShareAs(userData, dto.permission, '助手');

    const modelName = dto.modelName || (await this.resolveDefaultModel());
    const hasKnowledgeBase = !!(dto.datasetIds && dto.datasetIds.length > 0);
    // rerank 只在挂了知识库时才有意义——没有检索环节就没有可重排的东西，
    // 顺带省掉无知识库助手那一次 RAGFlow 模型列表查询。
    const rerankId =
      dto.rerankId ??
      (hasKnowledgeBase ? await this.resolveDefaultRerankId() : '');
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
        rerank_id: rerankId,
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
          rerankId,
          emptyResponse,
          opener,
          prompt,
          datasetIds: dto.datasetIds ?? [],
          deptId: dto.permission === 'team' ? userData.deptId : null,
          permission: dto.permission ?? 'me',
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

    const modelName = await this.resolveDefaultModel();
    const ragflowData = await this.ragflow.request<{ id: string }>(
      'POST',
      '/api/v1/chats',
      {
        name: '通用助手',
        description: '通用 AI 对话助手',
        dataset_ids: [],
        llm_id: modelName,
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
          modelName,
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
    const assistant = await this.assertCanView(id, user);

    // 不再传 user_id：RAGFlow 0.27 起把它硬编码成 API key 所属用户，传了也被丢弃。
    const session = await this.ragflow.request<{ id: string }>(
      'POST',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      { name: dto.name ?? '新会话' },
    );

    try {
      await this.prisma.client.assistantSession.create({
        data: { assistantId: id, sessionId: session.id, userId: user.sub },
      });
    } catch (error) {
      this.logger.error(
        `会话归属登记失败，回滚 RAGFlow 会话: ${session.id}`,
        error,
      );
      try {
        await this.ragflow.request(
          'DELETE',
          `/api/v1/chats/${assistant.assistantId}/sessions`,
          { ids: [session.id] },
        );
      } catch (rollbackError) {
        this.logger.error(
          `RAGFlow 会话回滚失败，孤儿会话: ${session.id}`,
          rollbackError,
        );
      }
      throw error;
    }

    return session;
  }

  async findAll(user: ActiveUserData, dto: QueryAssistantDto) {
    const { name, current, pageSize } = dto;
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });

    const where = {
      name: { contains: name, mode: 'insensitive' as const },
      ...buildVisibilityWhere(userData, { userId: user.sub }),
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
    const assistant = await this.assertCanView(id, user);
    const ownerOf = await this.sessionOwnerResolver(id, assistant.userId);

    // ponytail: 一次取至多 SESSION_FETCH_LIMIT 条再本地按归属过滤。RAGFlow 的
    //   list sessions 只能按单个 id 取、不支持批量，会话量超过这个上界时要改成
    //   以本地归属表为准的游标分页。
    const sessions = await this.ragflow.request<RagflowSessionRaw[]>(
      'GET',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        page: 1,
        page_size: AssistantService.SESSION_FETCH_LIMIT,
        name: dto.name,
      },
    );

    const mine = sessions.filter((s) => ownerOf(s.id) === user.sub);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 30;

    return mine.slice((page - 1) * pageSize, page * pageSize).map((s) => ({
      ...s,
      messages: normalizeMessageReferences(s.messages ?? []),
    }));
  }

  async findOne(id: number, user: ActiveUserData) {
    return this.assertCanView(id, user);
  }

  async remove(id: number, user: ActiveUserData) {
    const assistant = await this.assertCanEdit(id, user);

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
    const assistant = await this.assertCanView(id, user);
    await this.assertOwnsSession(id, assistant.userId, user, sessionId);

    const removed = await this.ragflow.request(
      'DELETE',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      { ids: [sessionId] },
    );

    await this.prisma.client.assistantSession.deleteMany({
      where: { sessionId },
    });

    return removed;
  }

  async update(user: ActiveUserData, id: number, dto: UpdateAssistantDto) {
    const assistant = await this.assertCanEdit(id, user);

    // 变更共享档位时同步 deptId，避免留下 deptId=null 的「团队助手」
    let permissionPatch:
      | undefined
      | { deptId: null | number; permission: string };
    if (dto.permission !== undefined) {
      const userData = await this.prisma.client.user.findUniqueOrThrow({
        where: { id: user.sub },
      });
      assertCanShareAs(userData, dto.permission, '助手');
      permissionPatch = {
        deptId: dto.permission === 'team' ? userData.deptId : null,
        permission: dto.permission,
      };
    }

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
        rerankId: dto.rerankId,
        emptyResponse: dto.emptyResponse,
        opener: dto.opener,
        prompt: dto.prompt,
        datasetIds: dto.datasetIds,
        ...permissionPatch,
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
            rerank_id: dto.rerankId,
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
            rerankId: assistant.rerankId,
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

  async updateSession(
    id: number,
    user: ActiveUserData,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const assistant = await this.assertCanView(id, user);
    await this.assertOwnsSession(id, assistant.userId, user, sessionId);

    await this.ragflow.request(
      'PATCH',
      `/api/v1/chats/${assistant.assistantId}/sessions/${sessionId}`,
      { name: dto.name },
    );

    return { message: '更新会话成功' };
  }

  /** 写入类操作：共享只放宽读，改 / 删仅创建者与 admin。 */
  private async assertCanEdit(id: number, user: ActiveUserData) {
    const { assistant, isOwner, userData } = await this.loadForAccess(id, user);
    if (!canEditResource(userData, isOwner)) {
      throw new ForbiddenException('无权操作此助手');
    }
    return assistant;
  }

  /** 读取 / 使用类操作：创建者、admin 及通过共享可见的用户都放行。 */
  private async assertCanView(id: number, user: ActiveUserData) {
    const { assistant, isOwner, userData } = await this.loadForAccess(id, user);
    if (!canViewResource(assistant, userData, isOwner)) {
      throw new ForbiddenException('无权访问此助手');
    }
    return assistant;
  }

  /**
   * 校验会话归当前用户所有。
   *
   * 会话是私人对话内容，这里不给 admin 特权：共享助手下各人只能读写自己的会话。
   */
  private async assertOwnsSession(
    assistantId: number,
    assistantOwnerId: number,
    user: ActiveUserData,
    sessionId: string,
  ): Promise<void> {
    const ownerOf = await this.sessionOwnerResolver(
      assistantId,
      assistantOwnerId,
    );
    if (ownerOf(sessionId) !== user.sub) {
      throw new ForbiddenException('无权操作此会话');
    }
  }

  private async loadForAccess(id: number, user: ActiveUserData) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    return { assistant, isOwner: assistant.userId === user.sub, userData };
  }

  /**
   * 解析默认 LLM 模型 ID（格式 `<llm_name>@<provider_id>`）：
   * 1. 优先使用 `ASSISTANT_DEFAULT_MODEL` 环境变量（部署侧固定）
   * 2. 否则从 RAGFlow `GET /v1/llm/list` 拉首个可用 chat 模型
   * 3. 实例未挂载任何可用 chat 模型时抛 ServiceUnavailableException
   */
  private async resolveDefaultModel(): Promise<string> {
    const configured = this.configService.get<string>(
      'ASSISTANT_DEFAULT_MODEL',
    );
    if (configured) return configured;

    const list = await this.ragflow.getLlmList();
    const chat = list.find(
      (item) => item.model_type === 'chat' && item.available,
    );
    if (!chat) {
      throw new ServiceUnavailableException(
        'RAGFlow 实例未挂载任何可用 chat 模型，请先在 RAGFlow 添加模型或配置 ASSISTANT_DEFAULT_MODEL',
      );
    }
    return `${chat.llm_name}@${chat.fid}`;
  }

  /**
   * 解析默认 rerank 模型引用（格式 `<llm_name>@<fid>`）。
   *
   * 与 `resolveDefaultModel` 的区别：rerank 是可选能力，实例没挂 rerank 模型时
   * 退化成不启用，而不是抛错——chat 模型缺失助手根本没法用，rerank 缺失只是回到
   * 纯向量 + 关键字混合排序，仍然可用。内网部署的那套 RAGFlow 就没有
   * SiliconFlow provider。
   *
   * 1. `ASSISTANT_DEFAULT_RERANK` 环境变量（部署侧固定，空串即显式关闭）
   * 2. 实例上挂了 `DEFAULT_ASSISTANT_RERANK_ID` 那个模型就用它
   * 3. 否则退到实例上任一可用 rerank 模型
   * 4. 一个都没有 → 空串，不启用
   */
  private async resolveDefaultRerankId(): Promise<string> {
    const configured = this.configService.get<string>(
      'ASSISTANT_DEFAULT_RERANK',
    );
    if (configured !== undefined) return configured;

    let available: RagflowLlmItem[];
    try {
      const list = await this.ragflow.getLlmList();
      available = list.filter(
        (item) => item.model_type === 'rerank' && item.available,
      );
    } catch (error) {
      // rerank 是可选增强，拉不到模型列表不该连累助手创建本身
      this.logger.warn('拉取 RAGFlow 模型列表失败，本次不启用 rerank', error);
      return '';
    }

    const picked =
      available.find(
        (item) =>
          `${item.llm_name}@${item.fid}` === DEFAULT_ASSISTANT_RERANK_ID,
      ) ?? available[0];
    if (!picked) {
      this.logger.log('RAGFlow 实例未挂载 rerank 模型，助手将不启用重排序');
      return '';
    }
    return `${picked.llm_name}@${picked.fid}`;
  }

  /**
   * 取该助手下「会话 → 归属用户」的查询函数。
   *
   * 归属表上线前建的会话没有记录，回退到助手创建者——共享是后加的能力，
   * 那些会话必然是创建者建的，这样历史会话不会凭空消失。
   */
  private async sessionOwnerResolver(
    assistantId: number,
    assistantOwnerId: number,
  ): Promise<(sessionId: string) => number> {
    const rows = await this.prisma.client.assistantSession.findMany({
      select: { sessionId: true, userId: true },
      where: { assistantId },
    });
    const owners = new Map(rows.map((r) => [r.sessionId, r.userId]));
    return (sessionId: string) => owners.get(sessionId) ?? assistantOwnerId;
  }
}
