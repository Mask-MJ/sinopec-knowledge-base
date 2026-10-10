import { Module } from '@nestjs/common';

import { HashingModule } from '@/common/hashing';
import { AssistantModule } from '@/modules/assistant/assistant.module';

import { SeedService } from './seed.service';

@Module({
  imports: [HashingModule, AssistantModule],
  providers: [SeedService],
})
export class SeedModule {}
