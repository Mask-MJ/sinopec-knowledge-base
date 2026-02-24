import path from 'node:path';

import { config } from '@dotenvx/dotenvx';
import { defineConfig } from 'prisma/config';

config({ path: path.resolve(process.cwd(), '../../.env') });

export default defineConfig({
  schema: path.join('prisma', 'models'),
  // schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
  typedSql: {
    path: path.join('prisma', 'sql'),
  },
});
