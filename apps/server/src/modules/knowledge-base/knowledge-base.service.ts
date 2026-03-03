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

import { Inject, Injectable, Logger, StreamableFile } from '@nestjs/common';

import { RagflowService } from '@/common/ragflow/ragflow.service';

/** 透传查询时默认最大页大小 */
const MAX_PAGE_SIZE = 100_000;

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    private readonly ragflow: RagflowService,
  ) {}

  // ─── Chunk Management ─────────────────────────────

  async addChunk(id: number, documentId: string, dto: AddChunkDto) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'POST',
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}/chunks`,
      {
        content: dto.content,
        important_keywords: dto.importantKeywords,
        questions: dto.questions,
      },
    );
  }

  // ─── Dataset CRUD ────────────────────────────────

  async create(user: ActiveUserData, dto: CreateKnowledgeBaseDto) {
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { dept: true },
    });

    // 先写本地 DB
    const knowledgeBase = await this.prisma.client.knowledgeBase.create({
      data: {
        ...dto,
        deptId: dto.permission === 'team' ? userData.deptId : null,
        createBy: user.username,
      },
    });

    try {
      // 再调 RAGFlow
      const ragflowData = await this.ragflow.request<{ id: string }>(
        'POST',
        '/api/v1/datasets',
        {
          name: dto.name,
          embedding_model: dto.embeddingModel,
          chunk_method: dto.chunkMethod,
          parser_config: dto.parserConfig,
          description: dto.description,
          permission: dto.permission,
          avatar: dto.avatar,
        },
      );

      // 回写 RAGFlow 返回的 datasetId
      return await this.prisma.client.knowledgeBase.update({
        where: { id: knowledgeBase.id },
        data: { datasetId: ragflowData.id },
      });
    } catch (error) {
      // 回滚本地 DB（回滚本身也做容错）
      try {
        await this.prisma.client.knowledgeBase.delete({
          where: { id: knowledgeBase.id },
        });
      } catch (rollbackError) {
        this.logger.error('知识库回滚失败，数据可能不一致', rollbackError);
      }
      throw error;
    }
  }

  async downloadDocument(
    id: number,
    documentId: string,
  ): Promise<StreamableFile> {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    const result = await this.ragflow.downloadFile(
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}`,
    );

    const filename = result.contentDisposition
      ? decodeURIComponent(
          (result.contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/) ??
            [])[1] ?? 'unknown',
        ).replaceAll(/['"]/g, '')
      : 'unknown';

    return new StreamableFile(result.data, {
      disposition: `attachment; filename="${filename}"`,
      type: result.contentType,
    });
  }

  async findAll(user: ActiveUserData, dto: QueryKnowledgeBaseDto) {
    const { name } = dto;
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { dept: true },
    });

    if (userData.isAdmin) {
      return await this.prisma.client.knowledgeBase.findMany({
        where: { name: { contains: name, mode: 'insensitive' } },
      });
    }

    return await this.prisma.client.knowledgeBase.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        OR: [{ createBy: userData.username }, { deptId: userData.dept?.id }],
      },
    });
  }

  async findAllChunks(id: number, documentId: string, dto: QueryChunkDto) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'GET',
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}/chunks`,
      {
        keywords: dto.keywords,
        page: dto.page,
        page_size: dto.pageSize,
        id: dto.id,
      },
    );
  }

  async findAllDocuments(id: number, dto: QueryDocumentDto) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'GET',
      `/api/v1/datasets/${kb.datasetId}/documents`,
      { ...dto, page: 1, page_size: MAX_PAGE_SIZE },
    );
  }

  async findOne(id: number) {
    return await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });
  }

  async getMetadataSummary(id: number) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'GET',
      `/api/v1/datasets/${kb.datasetId}/metadata/summary`,
    );
  }

  async parseDocuments(id: number, documentIds: string[]) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'POST',
      `/api/v1/datasets/${kb.datasetId}/documents/chunks`,
      { document_ids: documentIds },
    );
  }

  async remove(id: number) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    if (kb.datasetId) {
      await this.ragflow.request('DELETE', '/api/v1/datasets', {
        ids: [kb.datasetId],
      });
    }

    return await this.prisma.client.knowledgeBase.delete({ where: { id } });
  }

  async removeChunks(id: number, documentId: string, dto: DeleteChunkDto) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}/chunks`,
      { chunk_ids: dto.chunkIds },
    );
  }

  async removeDocuments(id: number, documentIds: string[]) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${kb.datasetId}/documents`,
      { ids: documentIds },
    );
  }

  async retrieveChunks(dto: RetrieveChunkDto) {
    return await this.ragflow.request('POST', '/api/v1/retrieval', {
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

  async stopParseDocuments(id: number, documentIds: string[]) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'DELETE',
      `/api/v1/datasets/${kb.datasetId}/documents/chunks`,
      { document_ids: documentIds },
    );
  }

  async update(user: ActiveUserData, dto: UpdateKnowledgeBaseDto) {
    const { id, ...rest } = dto;
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    if (kb.datasetId) {
      await this.ragflow.request('PUT', `/api/v1/datasets/${kb.datasetId}`, {
        name: rest.name,
        chunk_method: rest.chunkMethod,
        parser_config: rest.parserConfig,
        description: rest.description,
        permission: rest.permission,
        avatar: rest.avatar,
      });
    }

    return await this.prisma.client.knowledgeBase.update({
      where: { id },
      data: { ...dto, updateBy: user.username },
    });
  }

  async updateChunk(
    id: number,
    documentId: string,
    chunkId: string,
    dto: UpdateChunkDto,
  ) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'PUT',
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}/chunks/${chunkId}`,
      {
        content: dto.content,
        important_keywords: dto.importantKeywords,
        available: dto.available,
      },
    );
  }

  async updateDocument(id: number, documentId: string, dto: UpdateDocumentDto) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    return await this.ragflow.request(
      'PUT',
      `/api/v1/datasets/${kb.datasetId}/documents/${documentId}`,
      {
        name: dto.name,
        meta_fields: dto.metaFields,
        chunk_method: dto.chunkMethod,
        parser_config: dto.parserConfig,
      },
    );
  }

  async uploadDocuments(id: number, files: Express.Multer.File[]) {
    const kb = await this.prisma.client.knowledgeBase.findUniqueOrThrow({
      where: { id },
    });

    const formData = new FormData();
    for (const file of files) {
      formData.append(
        'file',
        new Blob([new Uint8Array(file.buffer)]),
        file.originalname,
      );
    }

    return await this.ragflow.uploadFile(
      `/api/v1/datasets/${kb.datasetId}/documents`,
      formData,
    );
  }
}
