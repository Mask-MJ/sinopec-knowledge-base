import { Module } from '@nestjs/common';

import { DocxPreprocessModule } from '@/common/docx-preprocess/docx-preprocess.module';
import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [DocxPreprocessModule, RagflowModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
