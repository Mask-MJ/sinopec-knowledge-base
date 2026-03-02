import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

import { BaseDto } from '@/common/dto/base.dto';

export class CreateOperationLogDto {
  @IsNumber()
  @Type(() => Number)
  businessType: number;

  @IsString()
  ip: string;

  @IsString()
  module: string;

  @IsString()
  title: string;

  @IsString()
  username: string;
}

export class QueryOperationLogDto extends PartialType(
  IntersectionType(
    PickType(CreateOperationLogDto, ['username', 'businessType', 'module']),
    BaseDto,
  ),
) {}
