import type { Linter } from 'eslint';

import createCommand from 'eslint-plugin-command/config';

export function command(): Linter.Config[] {
  return [
    {
      ...createCommand(),
    },
  ];
}
