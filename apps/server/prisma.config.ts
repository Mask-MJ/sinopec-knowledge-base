import { existsSync } from 'node:fs';
import path from 'node:path';

import { config } from '@dotenvx/dotenvx';
import { defineConfig } from 'prisma/config';

const envPath = path.resolve(process.cwd(), '../../.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

export default defineConfig({
  schema: path.join('prisma', 'models'),
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
  typedSql: {
    path: path.join('prisma', 'sql'),
  },
});
