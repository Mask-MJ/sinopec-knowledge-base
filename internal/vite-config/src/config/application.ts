import type { DefineApplicationOptions } from '../typing';
import type { UserConfig } from 'vite';

import { defineConfig, loadEnv, mergeConfig } from 'vite';

import { loadApplicationPlugins } from '../plugins';
import { loadAndConvertEnv } from '../utils/env';
import { getCommonConfig } from './common';

function defineApplicationConfig(userConfigPromise?: DefineApplicationOptions) {
  return defineConfig(async (config) => {
    const options = await userConfigPromise?.(config);
    const { appTitle, base, port, ...envConfig } = await loadAndConvertEnv();
    const { command, mode } = config;
    const { application = {}, vite = {} } = options || {};
    const root = process.cwd();
    const isBuild = command === 'build';
    const env = loadEnv(mode, root);

    const plugins = await loadApplicationPlugins({
      appTitle,
      devtools: true,
      env,
      html: true,
      isBuild,
      mode,
      ...envConfig,
      ...application,
    });

    const applicationConfig: UserConfig = {
      base,
      build: {
        rollupOptions: {
          output: {
            assetFileNames: '[ext]/[name]-[hash].[ext]',
            chunkFileNames: 'js/[name]-[hash].js',
            entryFileNames: 'jse/index-[name]-[hash].js',
          },
        },
        target: 'es2015',
      },
      esbuild: {
        drop: isBuild ? ['console', 'debugger'] : [],
        legalComments: 'none',
      },
      plugins,
      optimizeDeps: {
        include: [
          'vue',
          'vue-router',
          'pinia',
          'vue-i18n',
          '@vueuse/core',
          '@vueuse/integrations',
          'naive-ui',
          'pro-naive-ui',
          'dayjs',
          'lodash-es',
          'echarts/core',
          'echarts/charts',
          'echarts/components',
          'echarts/features',
          'echarts/renderers',
          'vue-echarts',
          'openapi-fetch',
          'defu',
          'nprogress',
        ],
      },
      server: {
        host: true,
        port,
        warmup: {
          clientFiles: [
            './index.html',
            './src/{views,layouts,router,store,components,api,composables}/*',
          ],
        },
      },
    };

    const mergedCommonConfig = mergeConfig(
      getCommonConfig(),
      applicationConfig,
    );
    return mergeConfig(mergedCommonConfig, vite);
  });
}

export { defineApplicationConfig };
