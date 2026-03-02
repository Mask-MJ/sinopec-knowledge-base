import { Module } from '@nestjs/common';

import { InfoController } from './info/info.controller';
import { InfoService } from './info/info.service';
import { LoginLogController } from './login-log/login-log.controller';
import { LoginLogService } from './login-log/login-log.service';
import { OperationLogController } from './operation-log/operation-log.controller';
import { OperationLogService } from './operation-log/operation-log.service';

@Module({
  controllers: [InfoController, LoginLogController, OperationLogController],
  providers: [InfoService, LoginLogService, OperationLogService],
})
export class MonitorModule {}
