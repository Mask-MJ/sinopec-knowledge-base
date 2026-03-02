import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';

import { QueryOperationLogDto } from './operation-log.dto';
import { OperationLogEntity } from './operation-log.entity';
import { OperationLogService } from './operation-log.service';

@ApiTags('操作日志管理')
@ApiBearerAuth('bearer')
@Controller('operation-log')
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  /**
   * 获取操作日志列表
   */
  @Get()
  @ApiPaginatedResponse(OperationLogEntity)
  findWithPagination(@Query() queryOperationDto: QueryOperationLogDto) {
    return this.operationLogService.findWithPagination(queryOperationDto);
  }

  /**
   * 获取操作日志详情
   */
  @Get(':id')
  @ApiOkResponse({ type: OperationLogEntity })
  findOne(@Param('id') id: number) {
    return this.operationLogService.findOne(id);
  }
}
