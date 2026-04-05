import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';
import type { Response } from 'express';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
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
  CreateAssistantDto,
  CreateCompletionsDto,
  CreateSessionDto,
  QueryAssistantDto,
  QuerySessionDto,
  UpdateAssistantDto,
  UpdateSessionDto,
} from './assistant.dto';
import { AssistantEntity, SessionEntity } from './assistant.entity';
import { AssistantService } from './assistant.service';

@ApiBearerAuth('bearer')
@ApiTags('聊天助手管理')
@Controller()
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  /**
   * 向指定的聊天助手提问以开始 AI 驱动的对话（SSE 流式响应）
   */
  @ApiOkResponse({ type: SessionEntity })
  @AutoPermission()
  @Post(':id/completions')
  completions(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateCompletionsDto,
    @Res() res: Response,
  ) {
    return this.assistantService.completions(id, user, dto, res);
  }

  /**
   * 创建聊天助手
   */
  @ApiCreatedResponse({ type: AssistantEntity })
  @AutoPermission()
  @Post()
  create(@ActiveUser() user: ActiveUserData, @Body() dto: CreateAssistantDto) {
    return this.assistantService.create(user, dto);
  }

  /**
   * 创建与聊天助手的会话
   */
  @ApiCreatedResponse({ type: SessionEntity })
  @AutoPermission()
  @Post(':id/sessions')
  createSession(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateSessionDto,
  ) {
    return this.assistantService.createSession(id, user, dto);
  }

  /**
   * 获取聊天助手列表
   */
  @ApiPaginatedResponse(AssistantEntity)
  @Get()
  findAll(@ActiveUser() user: ActiveUserData, @Query() dto: QueryAssistantDto) {
    return this.assistantService.findAll(user, dto);
  }

  /**
   * 获取与聊天助手的会话列表
   */
  @ApiOkResponse({ type: SessionEntity, isArray: true })
  @Get(':id/sessions')
  findAllSessions(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Query() dto: QuerySessionDto,
  ) {
    return this.assistantService.findAllSessions(id, user, dto);
  }

  /**
   * 获取聊天助手详情
   */
  @ApiOkResponse({ type: AssistantEntity })
  @Get(':id')
  findOne(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.assistantService.findOne(id, user);
  }

  /**
   * 删除聊天助手
   */
  @AutoPermission()
  @Delete(':id')
  remove(@Param('id') id: number, @ActiveUser() user: ActiveUserData) {
    return this.assistantService.remove(id, user);
  }

  /**
   * 删除与聊天助手的会话
   */
  @ApiOkResponse({ type: SessionEntity })
  @AutoPermission()
  @Delete(':id/sessions/:sessionId')
  removeSession(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.assistantService.removeSession(id, user, sessionId);
  }

  /**
   * 更新聊天助手
   */
  @ApiOkResponse({ type: AssistantEntity })
  @AutoPermission()
  @Patch(':id')
  update(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: number,
    @Body() dto: UpdateAssistantDto,
  ) {
    return this.assistantService.update(user, id, dto);
  }

  /**
   * 更新与聊天助手的会话
   */
  @ApiOkResponse({ type: SessionEntity })
  @AutoPermission()
  @Patch(':id/sessions/:sessionId')
  updateSession(
    @Param('id') id: number,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.assistantService.updateSession(id, sessionId, dto);
  }
}
