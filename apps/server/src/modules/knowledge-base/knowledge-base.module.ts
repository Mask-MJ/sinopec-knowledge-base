import { Module } from '@nestjs/common';

import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LlmController } from './llm.controller';

@Module({
  imports: [RagflowModule],
  controllers: [LlmController, KnowledgeBaseController],
  providers: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
