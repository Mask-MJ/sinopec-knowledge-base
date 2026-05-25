import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { CustomPrismaModule } from 'nestjs-prisma/dist/custom';

import { APP_ROUTES } from './app-routes';
import { ConfigModule } from './common/config/config.module';
import {
  extendedPrismaClient,
  PRISMA_SERVICE_TOKEN,
} from './common/database/prisma.extension';
import { LogsModule } from './common/logger/logs.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { AuthModule } from './modules/auth/auth.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { SeedModule } from './modules/seed/seed.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule,
    LogsModule,
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD', '');
        const redisUrl = `redis://:${password}@${host}:${port}`;
        return { stores: new KeyvRedis(redisUrl), namespace: 'sinopec-kb' };
      },
    }),
    CustomPrismaModule.forRootAsync({
      isGlobal: true,
      name: PRISMA_SERVICE_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const DATABASE_URL = configService.get<string>('DATABASE_URL', '');
        return extendedPrismaClient(DATABASE_URL, {
          max: configService.get<number>('DB_POOL_MAX'),
          idleTimeoutMillis: configService.get<number>('DB_POOL_IDLE_TIMEOUT'),
          connectionTimeoutMillis: configService.get<number>(
            'DB_POOL_CONNECTION_TIMEOUT',
          ),
        });
      },
    }),
    EventEmitterModule.forRoot(),
    RouterModule.register(APP_ROUTES),
    AuthModule,
    SystemModule,
    MonitorModule,
    KnowledgeBaseModule,
    AssistantModule,
    SeedModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
