import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

import { BaseDto } from '@/common/dto/base.dto';

export class CreateUserDto {
  /**
   * 头像
   * @example 'http://xxx.com/xxx.jpg'
   */
  @IsOptional()
  @IsUrl()
  avatar?: string;

  /**
   * 部门ID
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  deptId?: number;

  /**
   * 邮箱
   * @example 'xxx@qq.com'
   */
  @IsEmail()
  @IsOptional()
  email?: string;

  /**
   * 是否是部门管理员
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isDeptAdmin?: boolean = false;

  /**
   * 菜单ID
   * @example [1, 2]
   */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  menuIds?: number[];

  /**
   * 昵称
   * @example '管理员'
   */
  @IsOptional()
  @IsString()
  nickname?: string;

  /**
   * 密码
   * @example '123456'
   */
  @IsString()
  @MinLength(4)
  password: string;

  /**
   * 手机号
   * @example '18888888888'
   */
  @IsOptional()
  @IsPhoneNumber('CN')
  phoneNumber?: string;

  /**
   * 岗位ID
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  postId?: number;

  /**
   * 备注
   * @example '备注'
   */
  @IsOptional()
  @IsString()
  remark?: string;

  /**
   * 角色ID
   * @example [1, 2]
   */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  roleIds?: number[];

  /**
   * 性别 0: 女 1: 男 2: 未知
   * @example '1'
   */
  @IsEnum(['0', '1', '2'])
  @IsOptional()
  sex?: string = '1';

  /**
   * 状态 false: 禁用 true: 启用
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  status?: boolean = true;

  /**
   * 账号
   * @example 'admin'
   */
  @IsNotEmpty()
  @IsString()
  username: string;
}

export class QueryUserDto extends PartialType(
  IntersectionType(
    PickType(CreateUserDto, ['username', 'nickname', 'email', 'phoneNumber']),
    BaseDto,
  ),
) {}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  password: string;
}

export class AdminChangePasswordDto {
  @IsNumber()
  id: number;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  password: string;
}
