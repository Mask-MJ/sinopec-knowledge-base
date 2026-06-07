import type {
  AddChunkDto,
  CreateKnowledgeBaseDto,
  DeleteChunkDto,
  QueryChunkDto,
  QueryDocumentDto,
  QueryKnowledgeBaseDto,
  RetrieveChunkDto,
  UpdateChunkDto,
  UpdateDocumentDto,
  UpdateKnowledgeBaseDto,
} from './knowledge-base.dto';
import type { PrismaService } from '@/common/database/prisma.extension';
import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { Buffer } from 'node:buffer';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  StreamableFile,
} from '@nestjs/common';

import { ChunkTagStore } from '@/common/chunk-tagger/chunk-tag-store';
import { RUN } from '@/common/chunk-tagger/chunk-tagger.constants';
import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DEFAULT_KB_PARSER_CONFIG } from '@/common/defaults/knowledge-base.defaults';
import { DocxPreprocessService } from '@/common/docx-preprocess/docx-preprocess.service';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import { sanitizeFilename } from '@/common/utils';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
    private readonly docxPreprocess: DocxPreprocessService,
    private readonly chunkTagStore: ChunkTagStore,
  ) {}

  // ─── Private Helpers ──────────────────────────────

  async addChunk(
    id: number,
    user: ActiveUserData,
    documentId: string,
    dto: AddChunkDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'POST',
      `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks`,
      {
        content: dto.content,
        important_keywords: dto.importantKeywords,
        questions: dto.questions,
      },
    );
  }

  async create(user: ActiveUserData, dto: CreateKnowledgeBaseDto) {
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { dept: true },
    });

    if (
      dto.permission === 'team' &&
      !userData.isAdmin &&
      !userData.isDeptAdmin
    ) {
      throw new ForbiddenException('仅部门主管可创建部门公开知识库');
    }

    const parserConfig = {
      ...DEFAULT_KB_PARSER_CONFIG,
      ...dto.parserConfig,
    };
    const ragflowData = await this.ragflow.request<{ id: string }>(
      'POST',
      '/api/v1/datasets',
      {
        name: dto.name,
        embedding_model: dto.embeddingModel,
        chunk_method: dto.chunkMethod,
        parser_config: parserConfig,
        description: dto.description,
        permission: dto.permission,
        avatar: dto.avatar,
      },
    );

    try {
      return await this.prisma.client.knowledgeBase.create({
        data: {
          name: dto.name,
          avatar: dto.avatar,
          description: dto.description,
          embeddingModel: dto.embeddingModel as string,
          permission: dto.permission,
          chunkMethod: dto.chunkMethod,
          parserConfig: dto.parserConfig,
          order: dto.order,
          datasetId: ragflowData.id,
          deptId: dto.permission === 'team' ? userData.deptId : null,
          createBy: user.username,
        },
      });
    } catch (error) {
      this.logger.error(
        `DB 写入失败，回滚 RAGFlow 数据集: ${ragflowData.id}`,
        error,
      );
      try {
        await this.ragflow.request('DELETE', '/api/v1/datasets', {
          ids: [ragflowData.id],
        });
        this.logger.log(`RAGFlow 数据集 ${ragflowData.id} 已成功回滚`);
      } catch (rollbackError) {
        this.logger.error(
          `RAGFlow 回滚失败，孤儿数据集: ${ragflowData.id}`,
          rollbackError,
        );
      }
      throw error;
    }
  }

  // ─── Chunk Management ─────────────────────────────

  async downloadDocument(
    id: number,
    user: ActiveUserData,
    documentId: string,
  ): Promise<StreamableFile> {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    const result = await this.ragflow.downloadFile(
      `/api/v1/datasets/${datasetId}/documents/${documentId}`,
    );

    const rawFilename = result.contentDisposition
      ? decodeURIComponent(
          (result.contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/) ??
            [])[1] ?? 'unknown',
        ).replaceAll(/['"]/g, '')
      : 'unknown';
    const filename = rawFilename.replaceAll(/[^\w\s\-.]/g, '_').slice(0, 255);

    return new StreamableFile(result.data, {
      disposition: `attachment; filename="${filename}"`,
      type: result.contentType,
    });
  }

  // ─── Dataset CRUD ────────────────────────────────

  async findAll(user: ActiveUserData, dto: QueryKnowledgeBaseDto) {
    const { name, current, pageSize } = dto;
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { dept: true },
    });

    const nameFilter = {
      name: { contains: name, mode: 'insensitive' as const },
    };

    const where = userData.isAdmin
      ? nameFilter
      : {
          ...nameFilter,
          OR: [
            { createBy: userData.username },
            ...(userData.deptId
              ? [{ deptId: userData.deptId, permission: 'team' }]
              : []),
          ],
        };

    const [list, meta] = await this.prisma.client.knowledgeBase
      .paginate({ where, orderBy: { order: 'asc' } })
      .withPages({ page: current, limit: pageSize, includePageCount: true });

    return { list, ...meta };
  }

  async findAllChunks(
    id: number,
    user: ActiveUserData,
    documentId: string,
    dto: QueryChunkDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'GET',
      `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks`,
      {
        keywords: dto.keywords,
        page: dto.page,
        page_size: dto.pageSize,
        id: dto.id,
      },
    );
  }

  async findAllDocuments(
    id: number,
    user: ActiveUserData,
    dto: QueryDocumentDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'GET',
      `/api/v1/datasets/${datasetId}/documents`,
      {
        keywords: dto.name,
        page: dto.page,
        page_size: dto.pageSize,
      },
    );
  }

  async findOne(id: number, user: ActiveUserData) {
    return this.assertOwnership(id, user);
  }

  async getMetadataSummary(id: number, user: ActiveUserData) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'GET',
      `/api/v1/datasets/${datasetId}/metadata/summary`,
    );
  }

  async parseDocuments(
    id: number,
    user: ActiveUserData,
    documentIds: string[],
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    const result = await this.ragflow.request(
      'POST',
      `/api/v1/datasets/${datasetId}/chunks`,
      { document_ids: documentIds },
    );
    // 仅 parse 触发成功后入队;入队失败降级为 warn,绝不污染 parse 主流程
    try {
      await this.chunkTagStore.enqueue(datasetId, documentIds);
    } catch (error) {
      this.logger.warn(
        `enqueue chunk-tag 待办失败(降级,可手动回填):${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return result;
  }

  async remove(id: number, user: ActiveUserData) {
    const kb = await this.assertOwnership(id, user);

    // DB-first: 先删本地
    const deleted = await this.prisma.client.knowledgeBase.delete({
      where: { id },
    });

    // 再清理 RAGFlow（尽力而为）
    if (kb.datasetId) {
      try {
        await this.ragflow.request('DELETE', '/api/v1/datasets', {
          ids: [kb.datasetId],
        });
      } catch (error) {
        this.logger.error(
          `RAGFlow 数据集清理失败 (datasetId: ${kb.datasetId})，需人工清理`,
          error,
        );
      }
    }

    return deleted;
  }

  async removeChunks(
    id: number,
    user: ActiveUserData,
    documentId: string,
    dto: DeleteChunkDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks`,
      { chunk_ids: dto.chunkIds },
    );
  }

  async removeDocuments(
    id: number,
    user: ActiveUserData,
    documentIds: string[],
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${datasetId}/documents`,
      { ids: documentIds },
    );
  }

  async retrieveChunks(user: ActiveUserData, dto: RetrieveChunkDto) {
    if (!dto.datasetIds?.length) {
      throw new BadRequestException('datasetIds 不能为空');
    }

    // 校验 datasetIds 所有权
    {
      const kbs = await this.prisma.client.knowledgeBase.findMany({
        where: { datasetId: { in: dto.datasetIds } },
      });
      const userData = await this.prisma.client.user.findUniqueOrThrow({
        where: { id: user.sub },
        include: { dept: true },
      });
      if (!userData.isAdmin) {
        for (const kb of kbs) {
          const isOwner = kb.createBy === user.username;
          const isSameDept =
            kb.permission === 'team' &&
            kb.deptId !== null &&
            kb.deptId === userData.deptId;
          if (!isOwner && !isSameDept) {
            throw new ForbiddenException(
              `无权检索知识库 (datasetId: ${kb.datasetId})`,
            );
          }
        }
      }
    }

    return this.ragflow.request('POST', '/api/v1/retrieval', {
      question: dto.question,
      dataset_ids: dto.datasetIds,
      document_ids: dto.documentIds,
      page: dto.page,
      page_size: dto.pageSize,
      similarity_threshold: dto.similarityThreshold,
      vector_similarity_weight: dto.vectorSimilarityWeight,
      top_k: dto.topK,
      highlight: dto.highlight,
      use_kg: dto.useKg,
    });
  }

  async stopParseDocuments(
    id: number,
    user: ActiveUserData,
    documentIds: string[],
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${datasetId}/chunks`,
      { document_ids: documentIds },
    );
  }

  async toggleDocumentStatus(
    id: number,
    user: ActiveUserData,
    documentId: string,
    status: string,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'PUT',
      `/api/v1/datasets/${datasetId}/documents/${documentId}`,
      { enabled: Number(status) },
    );
  }

  async update(user: ActiveUserData, id: number, dto: UpdateKnowledgeBaseDto) {
    const kb = await this.assertOwnership(id, user);

    if (dto.permission === 'team') {
      const userData = await this.prisma.client.user.findUniqueOrThrow({
        where: { id: user.sub },
      });
      if (!userData.isAdmin && !userData.isDeptAdmin) {
        throw new ForbiddenException('仅部门主管可将知识库设为部门公开');
      }
    }

    // DB-first: 先更新本地
    const updated = await this.prisma.client.knowledgeBase.update({
      where: { id },
      data: {
        name: dto.name,
        avatar: dto.avatar,
        description: dto.description,
        chunkMethod: dto.chunkMethod,
        parserConfig: dto.parserConfig,
        permission: dto.permission,
        order: dto.order,
        updateBy: user.username,
      },
    });

    // 再同步 RAGFlow
    if (kb.datasetId) {
      try {
        await this.ragflow.request('PUT', `/api/v1/datasets/${kb.datasetId}`, {
          name: dto.name,
          chunk_method: dto.chunkMethod,
          parser_config: dto.parserConfig,
          description: dto.description,
          permission: dto.permission,
          avatar: dto.avatar,
        });
      } catch (error) {
        this.logger.error(`RAGFlow 同步失败，回滚本地 DB (id: ${id})`, error);
        await this.prisma.client.knowledgeBase.update({
          where: { id },
          data: {
            name: kb.name,
            avatar: kb.avatar,
            description: kb.description,
            chunkMethod: kb.chunkMethod,
            parserConfig: kb.parserConfig as object | undefined,
            permission: kb.permission,
            order: kb.order,
            updateBy: kb.updateBy,
          },
        });
        throw error;
      }
    }

    return updated;
  }

  async updateChunk(
    id: number,
    user: ActiveUserData,
    documentId: string,
    chunkId: string,
    dto: UpdateChunkDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'PUT',
      `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks/${chunkId}`,
      {
        content: dto.content,
        important_keywords: dto.importantKeywords,
        available: dto.available,
      },
    );
  }

  async updateDocument(
    id: number,
    user: ActiveUserData,
    documentId: string,
    dto: UpdateDocumentDto,
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    return this.ragflow.request(
      'PUT',
      `/api/v1/datasets/${datasetId}/documents/${documentId}`,
      {
        name: dto.name,
        meta_fields: dto.metaFields,
        chunk_method: dto.chunkMethod,
        parser_config: dto.parserConfig,
      },
    );
  }

  async uploadDocuments(
    id: number,
    user: ActiveUserData,
    files: Express.Multer.File[],
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    // RAGFlow 0.24 deepdoc DocxParser drops digits in many table cells, so
    // run docx through pandoc first; non-docx files pass through untouched.
    const preprocessed = await this.docxPreprocess.preprocessFiles(files);

    const formData = new FormData();
    for (const file of preprocessed) {
      const rawName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const filename = sanitizeFilename(rawName);
      formData.append(
        'file',
        new File([file.buffer], filename, { type: file.mimetype }),
      );
    }

    return this.ragflow.uploadFile(
      `/api/v1/datasets/${datasetId}/documents`,
      formData,
    );
  }

  /**
   * admin 回填:把该 KB 所有 run===DONE 的存量 doc 入队,轮询器后台统一打 tag。
   * admin-only 接口直接查 kb + assertAdmin(只查一次 user);不走 assertOwnership
   * ——其 owner/dept 判定对 admin-only 是死代码,且会多查一次 user(消除冗余)。
   */
  async backfillKeywords(
    id: number,
    user: ActiveUserData,
  ): Promise<{ enqueued: number; skipped: number }> {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });
    await this.assertAdmin(user, '仅管理员可回填关键词');
    const datasetId = this.requireDatasetId(kb);
    const docs = await this.listAllDatasetDocs(datasetId);
    const doneDocIds = docs.filter((d) => d.run === RUN.DONE).map((d) => d.id);
    await this.chunkTagStore.enqueue(datasetId, doneDocIds);
    return {
      enqueued: doneDocIds.length,
      skipped: docs.length - doneDocIds.length,
    };
  }

  /** admin 只读:该 KB 当前在待办里的 doc 数(自证回填进度)。 */
  async keywordTagStatus(
    id: number,
    user: ActiveUserData,
  ): Promise<{ pendingCount: number }> {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });
    await this.assertAdmin(user, '仅管理员可查看打 tag 状态');
    const datasetId = this.requireDatasetId(kb);
    const prefix = `${datasetId}:`;
    const pending = await this.chunkTagStore.listPending();
    return {
      pendingCount: pending.filter((p) => p.member.startsWith(prefix)).length,
    };
  }

  /** admin 硬约束:查当前用户,非 admin 抛 ForbiddenException。 */
  private async assertAdmin(
    user: ActiveUserData,
    message: string,
  ): Promise<void> {
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    if (!userData.isAdmin) {
      throw new ForbiddenException(message);
    }
  }

  private async assertOwnership(id: number, user: ActiveUserData) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { dept: true },
    });
    if (userData.isAdmin) return kb;
    // TODO: 当前使用 createBy(username) 判断所有权，若支持用户名修改需迁移为 userId 外键
    const isOwner = kb.createBy === user.username;
    const isSameDept =
      kb.permission === 'team' &&
      kb.deptId !== null &&
      kb.deptId === userData.deptId;
    if (!isOwner && !isSameDept) {
      throw new ForbiddenException('无权操作此知识库');
    }
    return kb;
  }

  private requireDatasetId(kb: {
    datasetId: null | string;
    id: number;
  }): string {
    if (!kb.datasetId) {
      throw new ConflictException(`知识库 ${kb.id} 尚未与 RAGFlow 数据集同步`);
    }
    return kb.datasetId;
  }

  /** 分页拉全某 dataset 的 documents(total 缺失时只靠短页终止,不静默截断)。 */
  private async listAllDatasetDocs(
    datasetId: string,
  ): Promise<{ id: string; run: string }[]> {
    const all: { id: string; run: string }[] = [];
    for (let page = 1; page < 1000; page++) {
      const data = await this.ragflow.request<{
        docs?: { id: string; run: string }[];
        total?: number;
      }>('GET', `/api/v1/datasets/${datasetId}/documents`, {
        page,
        page_size: 1000,
      });
      const docs = data.docs ?? [];
      all.push(...docs);
      if (
        docs.length < 1000 ||
        (data.total !== undefined && all.length >= data.total)
      ) {
        break;
      }
    }
    return all;
  }
}
