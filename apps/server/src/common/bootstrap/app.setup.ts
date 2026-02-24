import {
  ValidationPipe,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mw } from 'request-ip';

import { AllExceptionFilter } from '@/common/filters/all-exception.filter';

export interface AppConfig {
  cors: boolean;
  prefix: string;
  version?: string;
}

/**
 * 配置应用级设置（前缀、版本、管道、过滤器、中间件）
 */
export function setupApp(app: NestExpressApplication, config: AppConfig): void {
  // 全局前缀
  app.setGlobalPrefix(config.prefix);

  // 版本控制
  const defaultVersion = config.version
    ? config.version.split(',')
    : VERSION_NEUTRAL;
  app.enableVersioning({ type: VersioningType.URI, defaultVersion });

  // 全局管道
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 全局过滤器
  app.useGlobalFilters(new AllExceptionFilter(app.get(HttpAdapterHost)));

  // CORS
  if (config.cors) {
    app.enableCors();
  }

  // 中间件
  app.use(mw({ attributeName: 'ip' }));
}
