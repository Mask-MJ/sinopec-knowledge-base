import { config as dotenvxConfig } from '@dotenvx/dotenvx';
import { Module } from '@nestjs/common';
import { ConfigModule as Config } from '@nestjs/config';

import { validate } from './env.validation';

const envFilePath = '../../.env';

// Preload .env with dotenvx so template placeholders get expanded before Nest reads them.
dotenvxConfig({ path: envFilePath });

@Module({
  imports: [
    Config.forRoot({
      isGlobal: true,
      envFilePath,
      validate,
      expandVariables: true,
    }),
  ],
})
export class ConfigModule {}
