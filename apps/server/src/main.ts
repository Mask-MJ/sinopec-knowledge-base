import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { AppModule } from './app.module';
import { setupApp, setupSwagger } from './common/bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const appName = config.get<string>('APP_NAME', 'Sinopec KB');
  const port = config.get<number>('APP_PORT', 3000);
  const prefix = config.get<string>('APP_PREFIX', 'api');

  setupApp(app, {
    prefix,
    cors: config.get<boolean>('APP_CORS', false),
    version: config.get<string>('APP_VERSION'),
  });

  setupSwagger(app, appName);

  await app.listen(port);
  logger.log(
    `服务启动成功 | 地址: http://localhost:${port}/${prefix}/ | 文档: http://localhost:${port}/doc/`,
    'Bootstrap',
  );
}

bootstrap().catch(console.error);
