import { Module } from '@nestjs/common';

import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [RagflowModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
