import type { DefineConfig, ViteConfig } from '../typing';

import { defineApplicationConfig } from './application';

export * from './application';

function defineConfig(userConfigPromise?: DefineConfig): ViteConfig {
  return defineApplicationConfig(userConfigPromise);
}

export { defineConfig };
