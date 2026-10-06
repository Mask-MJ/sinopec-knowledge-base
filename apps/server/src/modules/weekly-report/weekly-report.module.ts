import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WeeklyReportController } from './weekly-report.controller';
import { WeeklyReportService } from './weekly-report.service';

@Module({
  imports: [HttpModule.register({})],
  controllers: [WeeklyReportController],
  providers: [WeeklyReportService],
})
export class WeeklyReportModule {}
