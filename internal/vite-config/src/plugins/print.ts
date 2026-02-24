import type { PrintPluginOptions } from '../typing';
import type { PluginOption } from 'vite';

import pc from 'picocolors';

export const vitePrintPlugin = (
  options: PrintPluginOptions = {},
): PluginOption => {
  const { infoMap = {} } = options;

  return {
    configureServer(server) {
      const _printUrls = server.printUrls;
      server.printUrls = () => {
        _printUrls();

        for (const [key, value] of Object.entries(infoMap)) {
          console.log(`  ${pc.green('➜')}  ${pc.bold(key)}: ${pc.cyan(value)}`);
        }
      };
    },
    enforce: 'pre',
    name: 'vite:print-info',
  };
};
