import { defineConfig } from '@sinopec-kb/eslint-config';

export default defineConfig([
  {
    ignores: ['src/metadata.ts'],
  },
  {
    files: ['prisma/seed.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]);
