import type { Linter } from 'eslint';

import { interopDefault } from '../util';

export async function turbo(): Promise<Linter.Config[]> {
  const configs = await interopDefault(import('eslint-config-turbo/flat'));
  const base: Linter.Config[] = Array.isArray(configs)
    ? configs
    : [configs as Linter.Config];

  return [
    ...base,
    {
      rules: {
        'turbo/no-undeclared-env-vars': [
          'error',
          {
            allowList: [
              // npm/pnpm runtime-injected
              'npm_lifecycle_script',
              // Vite built-in compile-time flags
              'DEV',
              'PROD',
              'CI',
              // Server runtime config (loaded from .env, not Turbo cache keys)
              'AUTH_*',
              'APP_*',
              'DATABASE_*',
              'REDIS_*',
              'MINIO_*',
              'RAGFLOW_*',
            ],
          },
        ],
      },
    },
  ];
}
