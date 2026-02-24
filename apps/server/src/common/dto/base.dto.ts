import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
} from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class PaginateDto {
  /**
   * 页码
   * @example 1
   */
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  current: number = 1;

  /**
   * 每页数量
   * @example 10
   */
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  pageSize: number = 10;
}

export class BaseDto extends IntersectionType(PaginateDto) {
  @IsArray()
  @IsOptional()
  @Type(() => Date)
  createdAt?: [Date, Date];

  /**
   * 排序顺序 asc 正序, desc 倒序
   * @example 'asc'
   */
  @IsEnum(SortOrder)
  @IsOptional()
  order: SortOrder = SortOrder.ASC;

  @IsArray()
  @IsOptional()
  @Type(() => Date)
  updatedAt?: [Date, Date];
}

/**
 * 日期范围查询 DTO
 * @description 通用日期范围过滤，可被其他 DTO 继承或组合
 */
export class DateRangeDto {
  /**
   * 日期范围
   * @example ["2024-01-01", "2024-01-31"]
   */
  @IsArray()
  @IsOptional()
  @Type(() => Date)
  dateRange?: [Date, Date];
}
