import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RagflowService } from '@/common/ragflow/ragflow.service';

@ApiBearerAuth('bearer')
@ApiTags('知识库管理')
@Controller()
export class LlmController {
  constructor(private readonly ragflowService: RagflowService) {}

  /**
   * 获取 RAGFlow 已配置的 LLM 模型列表
   */
  @ApiOkResponse({ description: '返回已配置的 LLM 模型列表' })
  @Get('llms')
  getLlmList() {
    return this.ragflowService.getLlmList();
  }
}
