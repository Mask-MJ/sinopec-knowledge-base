import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

import { PaginateDto } from '@/common/dto/base.dto';

// ─── Assistant DTO ───────────────────────────────

export class CreateAssistantDto {
  /**
   * 助手头像
   * @example 'https://example.com/avatar.png'
   */
  @IsOptional()
  @IsString()
  avatar?: string;

  /**
   * 关联的知识库数据集 ID 列表（RAGFlow datasetId）
   * @example ['dataset_id_1', 'dataset_id_2']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  datasetIds?: string[];

  /**
   * 助手描述
   * @example '这是一个智能助手'
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * 空响应返回内容
   * @example '无'
   */
  @IsOptional()
  @IsString()
  emptyResponse?: string;

  /**
   * 频率惩罚
   * @example 0.7
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  frequencyPenalty?: number = 0.7;

  /**
   * 关键词相似度权重
   * @example 0.7
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  keywordsSimilarityWeight?: number = 0.7;

  /**
   * 最大生成长度
   * @example 512
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxTokens?: number = 512;

  /**
   * 聊天模型名称（格式: model_name@provider）
   * @example 'deepseek-r1@Xinference'
   */
  @IsOptional()
  @IsString()
  modelName?: string;

  /**
   * 助手名称
   * @example '助手1'
   */
  @IsString()
  name: string;

  /**
   * 开场问候语
   * @example '你好，我是你的助手。'
   */
  @IsOptional()
  @IsString()
  opener?: string;

  /**
   * 存在惩罚
   * @example 0.4
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  presencePenalty?: number = 0.4;

  /**
   * 提示词模板
   * @example '<prompt>'
   */
  @IsOptional()
  @IsString()
  prompt?: string;

  /**
   * 加权关键字相似度
   * @example 0.2
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  similarityThreshold?: number = 0.2;

  /**
   * 温度
   * @example 0.1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  temperature?: number = 0.1;

  /**
   * 重新排序或选择前 k 个项目
   * @example 1024
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  topK?: number = 1024;

  /**
   * 生成的回复数量
   * @example 6
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  topN?: number = 6;

  /**
   * 核心采样
   * @example 0.3
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  topP?: number = 0.3;
}

export class QueryAssistantDto extends IntersectionType(
  PaginateDto,
  PartialType(PickType(CreateAssistantDto, ['name'])),
) {}

export class UpdateAssistantDto extends PartialType(CreateAssistantDto) {}

// ─── Session DTO ─────────────────────────────────

export class CreateSessionDto {
  /**
   * 会话名称
   * @example '会话1'
   */
  @IsOptional()
  @IsString()
  name?: string;
}

export class QuerySessionDto {
  /**
   * 会话名称
   * @example '会话1'
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

export class UpdateSessionDto extends PartialType(CreateSessionDto) {}

// ─── Completion DTO ──────────────────────────────

export class CreateCompletionsDto {
  /**
   * 开始人工智能对话的问题
   * @example '你好'
   */
  @IsString()
  question: string;

  /**
   * 会话ID
   * @example 'session_id'
   */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /**
   * 是否开启流式响应
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  stream?: boolean;
}
