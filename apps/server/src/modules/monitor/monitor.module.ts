import { Module } from '@nestjs/common';

import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { InfoController } from './info/info.controller';
import { InfoService } from './info/info.service';
import { LoginLogController } from './login-log/login-log.controller';
import { LoginLogService } from './login-log/login-log.service';
import { OperationLogController } from './operation-log/operation-log.controller';
import { OperationLogService } from './operation-log/operation-log.service';

@Module({
  controllers: [
    HealthController,
    InfoController,
    LoginLogController,
    OperationLogController,
  ],
  providers: [HealthService, InfoService, LoginLogService, OperationLogService],
})
export class MonitorModule {}
