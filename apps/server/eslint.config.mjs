import { defineConfig } from '@sinopec-kb/eslint-config';

export default defineConfig([
  {
    ignores: ['**/metadata.ts'],
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
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
]);
