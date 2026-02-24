import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

import { BaseDto } from 'src/common/dto/base.dto';

export class CreateRoleDto {
  /**
   * 菜单ID
   * @example [1, 2]
   */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  menuIds: number[];
  /**
   * 权限名称
   * @example '管理员'
   */
  @IsString()
  name: string;
  /**
   * 排序
   * @example 0
   */
  @IsNumber()
  @IsOptional()
  order?: number = 0;
  /**
   * 备注
   * @example '备注'
   */
  @IsOptional()
  @IsString()
  remark?: string;
  /**
   * 权限值
   * @example 'admin'
   */
  @IsString()
  value: string;
}
export class QueryRoleDto extends PartialType(
  IntersectionType(PickType(CreateRoleDto, ['name', 'value']), BaseDto),
) {}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @IsNumber()
  @IsOptional()
  id: number;
}
