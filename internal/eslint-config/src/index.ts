import type { Linter } from 'eslint';

import {
  command,
  disableds,
  ignores,
  importPluginConfig,
  javascript,
  jsdoc,
  jsonc,
  node,
  perfectionist,
  pnpm,
  prettier,
  regexp,
  test,
  turbo,
  typescript,
  unicorn,
  vue,
  yaml,
} from './configs';
import { customConfig } from './custom-config';

type FlatConfig = Linter.Config;

async function defineConfig(config: FlatConfig[] = []): Promise<FlatConfig[]> {
  const asyncConfigs = [
    vue(),
    jsonc(),
    prettier(),
    node(),
    perfectionist(),
    jsdoc(),
    unicorn(),
    test(),
    regexp(),
    turbo(),
    yaml(),
    pnpm(),
  ] satisfies Promise<FlatConfig[]>[];

  const syncConfigs = [
    ...javascript(),
    ...ignores(),
    ...typescript(),
    ...disableds(),
    ...importPluginConfig(),
    ...command(),
  ];

  const resolved = await Promise.all(asyncConfigs);

  return [...syncConfigs, ...resolved.flat(), ...customConfig, ...config];
}

export { defineConfig };
