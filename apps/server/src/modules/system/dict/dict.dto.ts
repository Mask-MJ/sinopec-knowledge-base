import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDictDto {
  /**
   * 字典名称
   * @example '性别'
   */
  @IsString()
  name: string;

  /**
   * 备注
   * @example '备注'
   */
  @IsOptional()
  @IsString()
  remark?: string;

  /**
   * 状态
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  status?: boolean;

  /**
   * 字典值
   * @example '1'
   */
  @IsString()
  value: string;
}
export class QueryDictDto extends PartialType(
  IntersectionType(PickType(CreateDictDto, ['name', 'value'])),
) {}

export class UpdateDictDto extends PartialType(CreateDictDto) {
  @IsNumber()
  @Type(() => Number)
  id: number;
}

export class CreateDictDataDto {
  /**
   * 字典ID
   * @example 1
   */
  @IsNumber()
  @Type(() => Number)
  dictId: number;

  /**
   * 字典数据名称
   * @example '性别'
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
   * 备注
   * @example '备注'
   */
  @IsOptional()
  @IsString()
  remark?: string;

  /**
   * 状态 false: 禁用 true: 启用
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  status?: boolean = true;

  /**
   * 字典数据值
   * @example '1'
   */
  @IsString()
  value: string;
}

export class QueryDictDataDto extends PartialType(
  IntersectionType(PickType(CreateDictDataDto, ['name', 'value', 'dictId'])),
) {
  /**
   * 字典名称
   * @example '性别'
   */
  @IsOptional()
  @IsString()
  dictName?: string;

  /**
   * 字典名称值
   * @example 'sex'
   */
  @IsOptional()
  @IsString()
  dictValue?: string;
}

export class UpdateDictDataDto extends PartialType(CreateDictDataDto) {
  @IsNumber()
  @IsOptional()
  id: number;
}
