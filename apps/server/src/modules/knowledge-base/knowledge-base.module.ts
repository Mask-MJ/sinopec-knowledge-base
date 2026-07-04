import { Module } from '@nestjs/common';

import { ChunkTaggerModule } from '@/common/chunk-tagger/chunk-tagger.module';
import { DocxPreprocessModule } from '@/common/docx-preprocess/docx-preprocess.module';
import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LlmController } from './llm.controller';

@Module({
  imports: [RagflowModule, DocxPreprocessModule, ChunkTaggerModule],
  controllers: [LlmController, KnowledgeBaseController],
  providers: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
