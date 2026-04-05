import type { Linter } from 'eslint';

export function disableds(): Linter.Config[] {
  return [
    {
      files: ['**/__tests__/**/*.?([cm])[jt]s?(x)'],
      name: 'disables/test',
      rules: {
        '@typescript-eslint/ban-ts-comment': 'off',
      },
    },
    {
      files: ['**/*.d.ts'],
      name: 'disables/dts',
      rules: {
        '@typescript-eslint/triple-slash-reference': 'off',
      },
    },
  ];
}
