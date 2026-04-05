import type { Linter } from 'eslint';

/**
 * Project-specific custom ESLint rules.
 * Equivalent to vben's custom-config.ts.
 */
const customConfig: Linter.Config[] = [
  // Internal configs and scripts don't need strict rules
  {
    files: ['internal/**/**', 'scripts/**/**'],
    rules: {
      'no-console': 'off',
    },
  },
];

export { customConfig };
