import { defineConfig } from '@sinopec-kb/eslint-config';

export default defineConfig([
  {
    ignores: ['src/metadata.ts'],
  },
  {
    files: ['*.config.{js,mjs,cjs}', '*.config.*.{js,mjs,cjs}'],
    rules: {
      'unicorn/prefer-module': 'off',
    },
  },
  {
    files: ['prisma/seed.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]);
