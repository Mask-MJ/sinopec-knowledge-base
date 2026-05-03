import { Module } from '@nestjs/common';

import { HashingModule } from '@/common/hashing';

import { SeedService } from './seed.service';

@Module({
  imports: [HashingModule],
  providers: [SeedService],
})
export class SeedModule {}
