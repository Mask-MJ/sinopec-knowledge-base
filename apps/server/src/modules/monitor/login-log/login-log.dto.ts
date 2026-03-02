import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { BaseDto } from '@/common/dto/base.dto';

export class CreateLoginLogDto {
  /**
   * 用户名
   * @example 'admin'
   */
  @IsString()
  username: string;

  /**
   * 登录 IP 地址
   * @example '192.168.1.1'
   */
  @IsString()
  ip: string;

  /**
   * 浏览器类型
   * @example 'Chrome'
   */
  @IsOptional()
  @IsString()
  browser: string;

  /**
   * 操作系统
   * @example 'Windows'
   */
  @IsOptional()
  @IsString()
  os: string;

  /**
   * 登录状态 true: 成功 false: 失败
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  status: boolean;
}

export class QueryLoginLogDto extends PartialType(
  IntersectionType(PickType(CreateLoginLogDto, ['username']), BaseDto),
) {}
