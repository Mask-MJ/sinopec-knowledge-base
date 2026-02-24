import type { Linter } from 'eslint';

/**
 * Project-specific custom ESLint rules.
 * Equivalent to vben's custom-config.ts.
 */
const customConfig: Linter.Config[] = [
  // NestJS uses empty decorated classes (e.g., AppModule), disable strict class check
  {
    files: ['**/apps/server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  // Internal configs and scripts don't need strict rules
  {
    files: ['internal/**/**', 'scripts/**/**'],
    rules: {
      'no-console': 'off',
    },
  },
];

export { customConfig };
