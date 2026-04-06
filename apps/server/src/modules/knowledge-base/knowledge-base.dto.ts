import {
  IntersectionType,
  OmitType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { PaginateDto } from '@/common/dto/base.dto';

// ─── Dataset DTO ─────────────────────────────────

export class CreateKnowledgeBaseDto {
  /**
   * 知识库头像（Base64）
   * @example 'https://example.com/avatar.png'
   */
  @IsOptional()
  @IsString()
  avatar?: string;

  /**
   * 解析方法
   * @example 'naive'
   */
  @IsOptional()
  @IsString()
  chunkMethod?: string = 'naive';

  /**
   * 描述
   * @example '这是一个知识库'
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * 嵌入模型（格式: model_name@provider）
   * @example 'bge-large-zh-v1.5@Xinference'
   */
  @IsOptional()
  @IsString()
  embeddingModel?: string = 'bge-large-zh-v1.5@Xinference';

  /**
   * 知识库名称
   * @example '知识库1'
   */
  @IsString()
  name: string;

  /**
   * 排序
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  order?: number;

  /**
   * 数据集分析器的配置设置
   * @example {"chunkTokenNum": 1024}
   */
  @IsObject()
  @IsOptional()
  parserConfig?: object;

  /**
   * 权限标识
   * @example 'me'
   */
  @IsIn(['me', 'team'])
  @IsOptional()
  permission?: 'me' | 'team';
}

export class QueryKnowledgeBaseDto extends IntersectionType(
  PaginateDto,
  PartialType(PickType(CreateKnowledgeBaseDto, ['name'])),
) {}

export class UpdateKnowledgeBaseDto extends PartialType(
  OmitType(CreateKnowledgeBaseDto, ['embeddingModel']),
) {}

// ─── Document DTO ────────────────────────────────

export class QueryDocumentDto {
  /**
   * 文档名称
   * @example '文档1'
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * 页码
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  /**
   * 每页数量
   * @example 30
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 30;
}

export class UpdateDocumentDto {
  /**
   * 解析方法
   * @example 'naive'
   */
  @IsOptional()
  @IsString()
  chunkMethod?: string = 'naive';

  /**
   * 文档元数据
   * @example {"author": "张三"}
   */
  @IsObject()
  @IsOptional()
  metaFields?: object;

  /**
   * 文档名称
   * @example '文档1'
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * 数据集分析器的配置设置
   * @example {"chunkTokenNum": 1024}
   */
  @IsObject()
  @IsOptional()
  parserConfig?: object;
}

export class DeleteDocumentDto {
  /**
   * 文件ID列表
   * @example ['78e5ae6691db11f084d3fa341edb7c4d']
   */
  @IsString({ each: true })
  documentIds: string[];
}

export class ParseDocumentDto extends DeleteDocumentDto {}

// ─── Chunk DTO ───────────────────────────────────

export class AddChunkDto {
  /**
   * 分块内容
   * @example '这是一段分块内容'
   */
  @IsString()
  content: string;

  /**
   * 关键词
   * @example ['关键词1', '关键词2']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  importantKeywords?: string[];

  /**
   * 问题列表
   * @example ['问题1']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  questions?: string[];
}

export class QueryChunkDto {
  /**
   * 分块ID
   * @example 'chunk_id'
   */
  @IsOptional()
  @IsString()
  id?: string;

  /**
   * 搜索关键词
   * @example '关键词'
   */
  @IsOptional()
  @IsString()
  keywords?: string;

  /**
   * 页码
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  /**
   * 每页数量
   * @example 1024
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 1024;
}

export class UpdateChunkDto {
  /**
   * 是否可用
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  available?: boolean;

  /**
   * 分块内容
   * @example '更新后的分块内容'
   */
  @IsOptional()
  @IsString()
  content?: string;

  /**
   * 关键词
   * @example ['关键词1', '关键词2']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  importantKeywords?: string[];
}

export class DeleteChunkDto {
  /**
   * 分块ID列表
   * @example ['chunk_id_1', 'chunk_id_2']
   */
  @IsString({ each: true })
  chunkIds: string[];
}

export class RetrieveChunkDto {
  /**
   * 数据集ID列表
   * @example ['dataset_id_1']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  datasetIds?: string[];

  /**
   * 文档ID列表
   * @example ['document_id_1']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  documentIds?: string[];

  /**
   * 是否高亮
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  highlight?: boolean;

  /**
   * 页码
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  /**
   * 每页数量
   * @example 30
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  /**
   * 检索问题
   * @example '什么是RAGFlow?'
   */
  @IsString()
  question: string;

  /**
   * 相似度阈值
   * @example 0.2
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  similarityThreshold?: number;

  /**
   * Top K
   * @example 1024
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  topK?: number;

  /**
   * 是否使用知识图谱
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  useKg?: boolean;

  /**
   * 向量相似度权重
   * @example 0.3
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  vectorSimilarityWeight?: number;
}
