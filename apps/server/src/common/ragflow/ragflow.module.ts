import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';

import { RagflowService } from './ragflow.service';

@Global()
@Module({
  imports: [HttpModule.register({})],
  providers: [RagflowService],
  exports: [RagflowService],
})
export class RagflowModule {}
