import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDeptDto {
  /**
   * 邮箱
   * @example xxx@qq.com
   */
  @IsOptional()
  @IsString()
  email?: string;
  /**
   * 负责人id
   * @example 1
   */
  @IsNumber()
  @Type(() => Number)
  leaderId: number;
  /**
   * 部门名称
   * @example '技术部'
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
   * 上级部门ID
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  parentId?: number;
  /**
   * 负责人电话
   * @example '13000000000'
   */
  @IsOptional()
  @IsString()
  phone?: string;
}

export class QueryDeptDto extends PartialType(
  IntersectionType(PickType(CreateDeptDto, ['name'])),
) {}

export class UpdateDeptDto extends PartialType(CreateDeptDto) {
  @IsNumber()
  @Type(() => Number)
  id: number;
}
