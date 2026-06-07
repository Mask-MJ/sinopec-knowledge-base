import { join } from 'node:path';

import { Module } from '@nestjs/common';

import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { ChunkTagQueueService } from './chunk-tag-queue.service';
import { ChunkTagStore } from './chunk-tag-store';
import { KEYWORD_MATCHER, MAX_KEYWORDS } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';
import { createKeywordMatcher } from './keyword-matcher';

// eslint-disable-next-line unicorn/prefer-module
const DATASET_DIR = join(__dirname, 'dataset');

@Module({
  imports: [RagflowModule],
  providers: [
    ChunkTaggerService,
    ChunkTagStore,
    ChunkTagQueueService,
    {
      provide: KEYWORD_MATCHER,
      useFactory: () =>
        createKeywordMatcher(
          join(DATASET_DIR, 'sinopec-concept-dict.csv'),
          join(DATASET_DIR, 'sinopec-regex-catalog.json'),
          MAX_KEYWORDS,
        ),
    },
  ],
  exports: [ChunkTaggerService, ChunkTagStore],
})
export class ChunkTaggerModule {}
