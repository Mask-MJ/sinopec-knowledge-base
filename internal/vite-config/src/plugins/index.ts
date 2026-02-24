import type {
  ApplicationPluginOptions,
  CommonPluginOptions,
  ConditionPlugin,
} from '../typing';
import type { PluginOption } from 'vite';

import viteVue from '@vitejs/plugin-vue';
import viteVueJsx from '@vitejs/plugin-vue-jsx';
import { visualizer as viteVisualizerPlugin } from 'rollup-plugin-visualizer';
import { createHtmlPlugin as viteHtmlPlugin } from 'vite-plugin-html';
import viteVueDevTools from 'vite-plugin-vue-devtools';

import { viteExtraAppConfigPlugin } from './extra-app-config';
import { viteMetadataPlugin } from './inject-metadata';
import { vitePrintPlugin } from './print';

/**
 * 获取条件成立的 vite 插件
 */
async function loadConditionPlugins(conditionPlugins: ConditionPlugin[]) {
  const plugins: PluginOption[] = [];
  for (const conditionPlugin of conditionPlugins) {
    if (conditionPlugin.condition) {
      const realPlugins = await conditionPlugin.plugins();
      plugins.push(...realPlugins);
    }
  }
  return plugins.flat();
}

/**
 * 加载通用插件
 */
async function loadCommonPlugins(
  options: CommonPluginOptions,
): Promise<ConditionPlugin[]> {
  const { devtools, injectMetadata, isBuild, visualizer } = options;
  return [
    {
      condition: true,
      plugins: () => [
        viteVue({
          script: {
            defineModel: true,
          },
        }),
        viteVueJsx(),
      ],
    },
    {
      condition: !isBuild && devtools,
      plugins: () => [viteVueDevTools()],
    },
    {
      condition: injectMetadata,
      plugins: async () => [await viteMetadataPlugin()],
    },
    {
      condition: isBuild && !!visualizer,
      plugins: () => [<PluginOption>viteVisualizerPlugin({
          filename: './node_modules/.cache/visualizer/stats.html',
          gzipSize: true,
          open: true,
        })],
    },
  ];
}

/**
 * 加载应用类型的 vite 插件
 */
async function loadApplicationPlugins(
  options: ApplicationPluginOptions,
): Promise<PluginOption[]> {
  // 单独取，否则 commonOptions 拿不到
  const isBuild = options.isBuild;

  const {
    autoImport,
    autoImportOptions,
    components,
    componentsOptions,
    extraAppConfig,
    html,
    i18n,
    i18nOptions,
    injectAppLoading,
    layouts,
    print,
    printInfoMap,
    unocss,
    vueRouter,
    vueRouterOptions,
    ...commonOptions
  } = options;

  const commonPlugins = await loadCommonPlugins(commonOptions);

  return await loadConditionPlugins([
    // VueRouter 必须在 Vue() 之前加载
    {
      condition: !!vueRouter,
      plugins: async () => {
        const mod = await import('unplugin-vue-router/vite');
        const VueRouter = mod.default;
        return [VueRouter(vueRouterOptions)];
      },
    },
    ...commonPlugins,
    {
      condition: !!i18n,
      plugins: async () => {
        const mod = await import('@intlify/unplugin-vue-i18n/vite');
        const VueI18nPlugin = mod.default;
        return [
          VueI18nPlugin({
            compositionOnly: true,
            fullInstall: true,
            runtimeOnly: true,
            ...i18nOptions,
          }),
        ];
      },
    },
    {
      condition: !!print,
      plugins: async () => {
        return [vitePrintPlugin({ infoMap: printInfoMap })];
      },
    },
    {
      condition: !!injectAppLoading,
      plugins: async () => {
        const mod = await import('vite-plugin-app-loading');
        const AppLoading = mod.default;
        return [AppLoading()];
      },
    },
    {
      condition: !!layouts,
      plugins: async () => {
        const mod = await import('vite-plugin-vue-layouts-next');
        const Layouts = mod.default;
        return [Layouts()];
      },
    },
    {
      condition: !!autoImport,
      plugins: async () => {
        const mod = await import('unplugin-auto-import/vite');
        const AutoImport = mod.default;
        return [AutoImport(autoImportOptions || {})];
      },
    },
    {
      condition: !!components,
      plugins: async () => {
        const mod = await import('unplugin-vue-components/vite');
        const Components = mod.default;
        return [Components(componentsOptions || {})];
      },
    },
    {
      condition: !!unocss,
      plugins: async () => {
        const mod = await import('unocss/vite');
        const Unocss = mod.default;
        return [Unocss()];
      },
    },
    {
      condition: !!html,
      plugins: () => [viteHtmlPlugin({ minify: true })],
    },
    {
      condition: isBuild && extraAppConfig,
      plugins: async () => [
        await viteExtraAppConfigPlugin({ isBuild: true, root: process.cwd() }),
      ],
    },
  ]);
}

export { loadApplicationPlugins };
