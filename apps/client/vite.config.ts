import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from '@sinopec-kb/vite-config';

import dotenv from 'dotenv';
import { ProNaiveUIResolver } from 'pro-naive-ui-resolver';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';

// 从 monorepo 根目录加载 .env（读取 APP_PORT 等非 VITE_ 前缀变量）
const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const backendPort = process.env.APP_PORT || 3001;

export default defineConfig(() => {
  return Promise.resolve({
    application: {
      autoImport: true,
      autoImportOptions: {
        dirs: ['src/stores/modules'],
        dts: 'types/auto-imports.d.ts',
        imports: [
          'vue',
          'vue-router',
          'pinia',
          '@vueuse/core',
          'vue-i18n',
          {
            'naive-ui': [
              'useDialog',
              'useMessage',
              'useNotification',
              'useLoadingBar',
            ],
          },
        ],
        vueTemplate: true,
      },
      components: true,
      componentsOptions: {
        dts: 'types/components.d.ts',
        resolvers: [NaiveUiResolver(), ProNaiveUIResolver()],
      },
      i18n: true,
      i18nOptions: {
        include: fileURLToPath(
          new URL('src/locales/langs/**', import.meta.url),
        ),
      },
      injectAppLoading: false,
      layouts: true,
      print: true,
      unocss: true,
      vueRouter: true,
      vueRouterOptions: {
        dts: 'types/typed-router.d.ts',
        extensions: ['.vue'],
        routesFolder: 'src/views',
      },
    },
    vite: {
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('src', import.meta.url)),
        },
      },
      server: {
        host: true,
        proxy: {
          '/api': {
            changeOrigin: true,
            target: `http://localhost:${backendPort}`,
          },
        },
      },
    },
  });
});
