import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

import { BaseDto } from '@/common/dto/base.dto';

export class CreateOperationLogDto {
  @IsString()
  title: string;

  @IsString()
  username: string;

  @IsNumber()
  @Type(() => Number)
  businessType: number;

  @IsString()
  module: string;

  @IsString()
  ip: string;
}

export class QueryOperationLogDto extends PartialType(
  IntersectionType(
    PickType(CreateOperationLogDto, ['username', 'businessType', 'module']),
    BaseDto,
  ),
) {}
