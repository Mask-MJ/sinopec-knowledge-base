import { Module } from '@nestjs/common';

import { DocxPreprocessService } from './docx-preprocess.service';

@Module({
  providers: [DocxPreprocessService],
  exports: [DocxPreprocessService],
})
export class DocxPreprocessModule {}
