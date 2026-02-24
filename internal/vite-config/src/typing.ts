import type { PluginVisualizerOptions } from 'rollup-plugin-visualizer';
import type {
  ConfigEnv,
  PluginOption,
  UserConfig,
  UserConfigFnPromise,
} from 'vite';

/**
 * 打印插件配置选项
 */
interface PrintPluginOptions {
  /** 打印的数据映射 */
  infoMap?: Record<string, string | undefined>;
}

/**
 * 条件插件配置
 */
interface ConditionPlugin {
  /** 判断条件，为 true 时加载插件 */
  condition?: boolean;
  /** 插件工厂函数 */
  plugins: () => PluginOption[] | PromiseLike<PluginOption[]>;
}

/**
 * 通用插件配置选项
 */
interface CommonPluginOptions {
  /** 是否开启开发工具 */
  devtools?: boolean;
  /** 环境变量 */
  env?: Record<string, any>;
  /** 是否注入元数据 */
  injectMetadata?: boolean;
  /** 是否为构建模式 */
  isBuild?: boolean;
  /** 构建模式 */
  mode?: string;
  /** 是否开启依赖分析 */
  visualizer?: boolean | PluginVisualizerOptions;
}

/**
 * 应用插件配置选项
 */
interface ApplicationPluginOptions extends CommonPluginOptions {
  /** 是否开启 AutoImport */
  autoImport?: boolean;
  /** AutoImport 插件配置 */
  autoImportOptions?: Record<string, any>;
  /** 是否开启 Components 自动注册 */
  components?: boolean;
  /** Components 插件配置 */
  componentsOptions?: Record<string, any>;
  /** 是否抽离配置文件 */
  extraAppConfig?: boolean;
  /** 是否开启 HTML 插件 */
  html?: boolean;
  /** 是否开启国际化 */
  i18n?: boolean;
  /** i18n 插件配置 */
  i18nOptions?: {
    include?: string;
  };
  /** 是否注入应用加载动画 */
  injectAppLoading?: boolean;
  /** 是否开启 Layouts */
  layouts?: boolean;
  /** 是否开启控制台打印 */
  print?: boolean;
  /** 打印插件配置 */
  printInfoMap?: PrintPluginOptions['infoMap'];
  /** 是否开启 UnoCSS */
  unocss?: boolean;
  /** 是否开启文件路由 (unplugin-vue-router) */
  vueRouter?: boolean;
  /** VueRouter 插件配置 */
  vueRouterOptions?: Record<string, any>;
}

/**
 * 应用配置定义函数类型
 */
type DefineApplicationOptions = (config?: ConfigEnv) => Promise<{
  /** 应用插件配置 */
  application?: ApplicationPluginOptions;
  /** Vite 配置 */
  vite?: UserConfig;
}>;

/**
 * 配置定义类型
 */
type DefineConfig = DefineApplicationOptions;

type ViteConfig = Promise<UserConfig> | UserConfig | UserConfigFnPromise;

export type {
  ApplicationPluginOptions,
  CommonPluginOptions,
  ConditionPlugin,
  DefineApplicationOptions,
  DefineConfig,
  PrintPluginOptions,
  ViteConfig,
};
