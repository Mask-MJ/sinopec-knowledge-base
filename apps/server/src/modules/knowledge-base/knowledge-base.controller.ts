import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { FilesUploadDto } from '@/common/dto/upload.dto';
import { ApiPaginatedResponse } from '@/common/response/paginated.response';
import { AutoPermission } from '@/modules/auth/authorization/decorators/auto-permission.decorator';
import { ActiveUser } from '@/modules/auth/decorators/active-user.decorator';

import {
  AddChunkDto,
  CreateKnowledgeBaseDto,
  DeleteChunkDto,
  DeleteDocumentDto,
  ParseDocumentDto,
  QueryChunkDto,
  QueryDocumentDto,
  QueryKnowledgeBaseDto,
  RetrieveChunkDto,
  ToggleDocumentStatusDto,
  UpdateChunkDto,
  UpdateDocumentDto,
  UpdateKnowledgeBaseDto,
} from './knowledge-base.dto';
import { KnowledgeBaseEntity } from './knowledge-base.entity';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiBearerAuth('bearer')
@ApiTags('知识库管理')
@Controller()
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * 添加分块
   */
  @AutoPermission()
  @Post(':id/documents/:documentId/chunks')
  addChunk(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Body() dto: AddChunkDto,
  ) {
    return this.knowledgeBaseService.addChunk(id, user, documentId, dto);
  }

  // ─── Dataset CRUD ────────────────────────────────

  /**
   * 创建知识库
   */
  @ApiCreatedResponse({ type: KnowledgeBaseEntity })
  @AutoPermission()
  @Post()
  create(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.create(user, dto);
  }

  /**
   * 下载知识库文件
   */
  @Get(':id/documents/:documentId')
  downloadDocument(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
  ): Promise<StreamableFile> {
    return this.knowledgeBaseService.downloadDocument(id, user, documentId);
  }

  /**
   * 获取知识库列表
   */
  @ApiPaginatedResponse(KnowledgeBaseEntity)
  @Get()
  findAll(
    @ActiveUser() user: ActiveUserData,
    @Query() dto: QueryKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.findAll(user, dto);
  }

  /**
   * 获取分块列表
   */
  @Get(':id/documents/:documentId/chunks')
  findAllChunks(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Query() dto: QueryChunkDto,
  ) {
    return this.knowledgeBaseService.findAllChunks(id, user, documentId, dto);
  }

  /**
   * 获取知识库文件列表
   */
  @Get(':id/documents')
  findAllDocuments(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Query() dto: QueryDocumentDto,
  ) {
    return this.knowledgeBaseService.findAllDocuments(id, user, dto);
  }

  // ─── Document Management ──────────────────────────

  /**
   * 获取知识库详情
   */
  @ApiOkResponse({ type: KnowledgeBaseEntity })
  @Get(':id')
  findOne(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.knowledgeBaseService.findOne(id, user);
  }

  /**
   * 获取知识库元数据摘要
   */
  @Get(':id/metadata/summary')
  getMetadataSummary(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.knowledgeBaseService.getMetadataSummary(id, user);
  }

  /**
   * 解析指定知识库中的文件
   */
  @AutoPermission()
  @Post(':id/parse')
  parseDocuments(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Body() dto: ParseDocumentDto,
  ) {
    return this.knowledgeBaseService.parseDocuments(id, user, dto.documentIds);
  }

  /**
   * 删除知识库
   */
  @AutoPermission()
  @Delete(':id')
  remove(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.knowledgeBaseService.remove(id, user);
  }

  /**
   * 删除分块
   */
  @AutoPermission()
  @Delete(':id/documents/:documentId/chunks')
  removeChunks(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Body() dto: DeleteChunkDto,
  ) {
    return this.knowledgeBaseService.removeChunks(id, user, documentId, dto);
  }

  /**
   * 删除知识库文件
   */
  @AutoPermission()
  @Delete(':id/documents')
  removeDocuments(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Body() dto: DeleteDocumentDto,
  ) {
    return this.knowledgeBaseService.removeDocuments(id, user, dto.documentIds);
  }

  // ─── Chunk Management ─────────────────────────────

  /**
   * 检索分块
   */
  @Post('retrieval')
  retrieveChunks(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: RetrieveChunkDto,
  ) {
    return this.knowledgeBaseService.retrieveChunks(user, dto);
  }

  /**
   * 停止解析指定知识库中的文件
   */
  @AutoPermission()
  @Delete(':id/parse')
  stopParseDocuments(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Body() dto: ParseDocumentDto,
  ) {
    return this.knowledgeBaseService.stopParseDocuments(
      id,
      user,
      dto.documentIds,
    );
  }

  /**
   * 切换知识库文档启用状态
   */
  @AutoPermission()
  @Patch(':id/documents/:documentId/status')
  toggleDocumentStatus(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Body() dto: ToggleDocumentStatusDto,
  ) {
    return this.knowledgeBaseService.toggleDocumentStatus(
      id,
      user,
      documentId,
      dto.status,
    );
  }

  /**
   * 更新知识库
   */
  @ApiOkResponse({ type: KnowledgeBaseEntity })
  @AutoPermission()
  @Patch(':id')
  update(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: number,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.update(user, id, dto);
  }

  /**
   * 更新分块
   */
  @AutoPermission()
  @Put(':id/documents/:documentId/chunks/:chunkId')
  updateChunk(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Param('chunkId') chunkId: string,
    @Body() dto: UpdateChunkDto,
  ) {
    return this.knowledgeBaseService.updateChunk(
      id,
      user,
      documentId,
      chunkId,
      dto,
    );
  }

  /**
   * 更新知识库文件
   */
  @AutoPermission()
  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.knowledgeBaseService.updateDocument(id, user, documentId, dto);
  }

  /**
   * 上传文件到指定知识库
   */
  @ApiBody({ description: '上传文件', type: FilesUploadDto })
  @ApiConsumes('multipart/form-data')
  @AutoPermission()
  @Post(':id/documents')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ALLOWED_MIMES = new Set([
          'application/msword',
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/csv',
          'text/markdown',
          'text/plain',
        ]);

        // 当浏览器无法识别 MIME 时回退到扩展名判断
        const ALLOWED_EXTS = new Set([
          '.csv',
          '.doc',
          '.docx',
          '.md',
          '.pdf',
          '.txt',
          '.xls',
          '.xlsx',
        ]);

        if (ALLOWED_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else if (file.mimetype === 'application/octet-stream') {
          const ext = file.originalname
            .slice(file.originalname.lastIndexOf('.'))
            .toLowerCase();
          if (ALLOWED_EXTS.has(ext)) {
            cb(null, true);
          } else {
            cb(new BadRequestException(`不支持的文件类型: ${ext}`), false);
          }
        } else {
          cb(
            new BadRequestException(`不支持的文件类型: ${file.mimetype}`),
            false,
          );
        }
      },
    }),
  )
  uploadDocuments(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.knowledgeBaseService.uploadDocuments(id, user, files);
  }
}
