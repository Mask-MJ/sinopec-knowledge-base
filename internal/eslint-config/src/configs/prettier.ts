import type { Linter } from 'eslint';

import { interopDefault } from '../util';

export async function prettier(): Promise<Linter.Config[]> {
  const [configPrettier, pluginPrettier] = await Promise.all([
    interopDefault(import('eslint-config-prettier/flat')),
    interopDefault(import('eslint-plugin-prettier')),
  ] as const);

  return [
    // Disable all rules that conflict with Prettier
    configPrettier as Linter.Config,
    // Then report Prettier violations as ESLint errors
    {
      plugins: {
        prettier: pluginPrettier,
      },
      rules: {
        'prettier/prettier': 'error',
      },
    },
  ];
}
