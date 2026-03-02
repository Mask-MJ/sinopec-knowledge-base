import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';

import { QueryLoginLogDto } from './login-log.dto';
import { LoginLogEntity } from './login-log.entity';
import { LoginLogService } from './login-log.service';

@ApiTags('登录日志管理')
@ApiBearerAuth('bearer')
@Controller('login-log')
export class LoginLogController {
  constructor(private readonly loginLogService: LoginLogService) {}

  /**
   * 获取登录日志列表
   */
  @Get()
  @ApiPaginatedResponse(LoginLogEntity)
  findWithPagination(@Query() queryLoginLogDto: QueryLoginLogDto) {
    return this.loginLogService.findWithPagination(queryLoginLogDto);
  }

  /**
   * 获取登录日志详情
   */
  @Get(':id')
  @ApiOkResponse({ type: LoginLogEntity })
  findOne(@Param('id') id: number) {
    return this.loginLogService.findOne(id);
  }
}
