import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { RagflowService } from './ragflow.service';

@Module({
  imports: [HttpModule.register({})],
  providers: [RagflowService],
  exports: [RagflowService],
})
export class RagflowModule {}
