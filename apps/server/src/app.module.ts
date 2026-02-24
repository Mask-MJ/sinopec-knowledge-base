import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { CustomPrismaModule } from 'nestjs-prisma/dist/custom';

import { ConfigModule } from './common/config/config.module';
import { extendedPrismaClient } from './common/database/prisma.extension';
import { LogsModule } from './common/logger/logs.module';
// import { AuthModule } from './modules/auth/auth.module';
// import { MonitorModule } from './modules/monitor/monitor.module';
// import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule,
    LogsModule,
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => {
        const host = configService.get('REDIS_HOST', 'localhost');
        const port = configService.get('REDIS_PORT', 6379);
        const password = configService.get('REDIS_PASSWORD', '');
        const redisUrl = `redis://:${password}@${host}:${port}`;
        return { stores: new KeyvRedis(redisUrl), namespace: 'datahub' };
      },
    }),
    CustomPrismaModule.forRootAsync({
      isGlobal: true,
      name: 'PrismaService',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const DATABASE_URL = configService.get<string>('DATABASE_URL', '');
        return extendedPrismaClient(DATABASE_URL);
      },
    }),
    EventEmitterModule.forRoot(),
    RouterModule.register([
      // { path: 'auth', module: AuthModule },
      // { path: 'system', module: SystemModule },
      // { path: 'monitor', module: MonitorModule },
    ]),
    // AuthModule,
    // SystemModule,
    // MonitorModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
