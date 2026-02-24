import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';

import { createLoggerConfig } from './logger.config';

@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createLoggerConfig(configService.get<boolean>('LOG_ON', true)),
    }),
  ],
})
export class LogsModule {}
