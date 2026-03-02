import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';

import { QueryOperationLogDto } from './operation-log.dto';
import { OperationLogEntity } from './operation-log.entity';
import { OperationLogService } from './operation-log.service';

@ApiBearerAuth('bearer')
@ApiTags('操作日志管理')
@Controller('operation-log')
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  /**
   * 获取操作日志详情
   */
  @ApiOkResponse({ type: OperationLogEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.operationLogService.findOne(id);
  }

  /**
   * 获取操作日志列表
   */
  @ApiPaginatedResponse(OperationLogEntity)
  @Get()
  findWithPagination(@Query() queryOperationDto: QueryOperationLogDto) {
    return this.operationLogService.findWithPagination(queryOperationDto);
  }
}
