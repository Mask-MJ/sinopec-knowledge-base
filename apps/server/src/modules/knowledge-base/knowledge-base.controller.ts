import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import {
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
  UpdateChunkDto,
  UpdateDocumentDto,
  UpdateKnowledgeBaseDto,
} from './knowledge-base.dto';
import { KnowledgeBaseEntity } from './knowledge-base.entity';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiBearerAuth('bearer')
@ApiTags('知识库管理')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  // ─── Dataset CRUD ────────────────────────────────

  /**
   * 添加分块
   */
  @AutoPermission()
  @Post(':id/documents/:documentId/chunks')
  addChunk(
    @Param('id') id: number,
    @Param('documentId') documentId: string,
    @Body() dto: AddChunkDto,
  ) {
    return this.knowledgeBaseService.addChunk(id, documentId, dto);
  }

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
    @Param('documentId') documentId: string,
  ): Promise<StreamableFile> {
    return this.knowledgeBaseService.downloadDocument(id, documentId);
  }

  /**
   * 获取知识库列表
   */
  @ApiOkResponse({ type: KnowledgeBaseEntity, isArray: true })
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
    @Param('documentId') documentId: string,
    @Query() dto: QueryChunkDto,
  ) {
    return this.knowledgeBaseService.findAllChunks(id, documentId, dto);
  }

  // ─── Document Management ──────────────────────────

  /**
   * 获取知识库文件列表
   */
  @Get(':id/documents')
  findAllDocuments(@Param('id') id: number, @Query() dto: QueryDocumentDto) {
    return this.knowledgeBaseService.findAllDocuments(id, dto);
  }

  /**
   * 获取知识库详情
   */
  @ApiOkResponse({ type: KnowledgeBaseEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.knowledgeBaseService.findOne(id);
  }

  /**
   * 获取知识库元数据摘要
   */
  @Get(':id/metadata/summary')
  getMetadataSummary(@Param('id') id: number) {
    return this.knowledgeBaseService.getMetadataSummary(id);
  }

  /**
   * 解析指定知识库中的文件
   */
  @AutoPermission()
  @Post(':id/parse')
  parseDocuments(@Param('id') id: number, @Body() dto: ParseDocumentDto) {
    return this.knowledgeBaseService.parseDocuments(id, dto.documentIds);
  }

  /**
   * 删除知识库
   */
  @AutoPermission()
  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.knowledgeBaseService.remove(id);
  }

  /**
   * 删除分块
   */
  @AutoPermission()
  @Delete(':id/documents/:documentId/chunks')
  removeChunks(
    @Param('id') id: number,
    @Param('documentId') documentId: string,
    @Body() dto: DeleteChunkDto,
  ) {
    return this.knowledgeBaseService.removeChunks(id, documentId, dto);
  }

  /**
   * 删除知识库文件
   */
  @AutoPermission()
  @Delete(':id/documents')
  removeDocuments(@Param('id') id: number, @Body() dto: DeleteDocumentDto) {
    return this.knowledgeBaseService.removeDocuments(id, dto.documentIds);
  }

  // ─── Chunk Management ─────────────────────────────

  /**
   * 检索分块
   */
  @Post('retrieval')
  retrieveChunks(@Body() dto: RetrieveChunkDto) {
    return this.knowledgeBaseService.retrieveChunks(dto);
  }

  /**
   * 停止解析指定知识库中的文件
   */
  @AutoPermission()
  @Delete(':id/parse')
  stopParseDocuments(@Param('id') id: number, @Body() dto: ParseDocumentDto) {
    return this.knowledgeBaseService.stopParseDocuments(id, dto.documentIds);
  }

  /**
   * 更新知识库
   */
  @ApiOkResponse({ type: KnowledgeBaseEntity })
  @AutoPermission()
  @Patch(':id')
  update(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.update(user, dto);
  }

  /**
   * 更新分块
   */
  @AutoPermission()
  @Put(':id/documents/:documentId/chunks/:chunkId')
  updateChunk(
    @Param('id') id: number,
    @Param('documentId') documentId: string,
    @Param('chunkId') chunkId: string,
    @Body() dto: UpdateChunkDto,
  ) {
    return this.knowledgeBaseService.updateChunk(id, documentId, chunkId, dto);
  }

  /**
   * 更新知识库文件
   */
  @AutoPermission()
  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: number,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.knowledgeBaseService.updateDocument(id, documentId, dto);
  }

  /**
   * 上传文件到指定知识库
   */
  @ApiBody({ description: '上传文件', type: FilesUploadDto })
  @ApiConsumes('multipart/form-data')
  @AutoPermission()
  @Post(':id/documents')
  @UseInterceptors(FilesInterceptor('files'))
  uploadDocuments(
    @Param('id') id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.knowledgeBaseService.uploadDocuments(id, files);
  }
}
