import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';
import { AutoPermission } from '@/modules/auth/authorization/decorators/auto-permission.decorator';
import { ActiveUser } from '@/modules/auth/decorators/active-user.decorator';

import {
  GenerateWeeklyReportDto,
  QueryWeeklyReportDto,
} from './weekly-report.dto';
import {
  WeeklyReportEntity,
  WeeklyReportListItemEntity,
} from './weekly-report.entity';
import { WeeklyReportService } from './weekly-report.service';

/**
 * 路由必须带 `reports` 这一段：AutoPermission 取 `/api` 后的前两段拼权限码，
 * 挂在模块根上只有一段，会生成不出权限码而直接放行。
 */
@ApiBearerAuth('bearer')
@ApiTags('周报助手')
@Controller('reports')
export class WeeklyReportController {
  constructor(private readonly weeklyReportService: WeeklyReportService) {}

  /**
   * 获取周报历史列表（不含正文）
   */
  @ApiPaginatedResponse(WeeklyReportListItemEntity)
  @AutoPermission()
  @Get()
  findAll(
    @ActiveUser() user: ActiveUserData,
    @Query() dto: QueryWeeklyReportDto,
  ) {
    return this.weeklyReportService.findAll(user, dto);
  }

  /**
   * 获取周报详情
   */
  @ApiOkResponse({ type: WeeklyReportEntity })
  @AutoPermission()
  @Get(':id')
  findOne(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.weeklyReportService.findOne(id, user);
  }

  /**
   * 生成周报（同步等待对方服务返回，耗时可能数分钟）
   */
  @ApiCreatedResponse({ type: WeeklyReportEntity })
  @AutoPermission()
  @Post()
  generate(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: GenerateWeeklyReportDto,
  ) {
    return this.weeklyReportService.generate(user, dto);
  }

  /**
   * 删除周报
   */
  @AutoPermission()
  @Delete(':id')
  remove(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.weeklyReportService.remove(id, user);
  }
}
