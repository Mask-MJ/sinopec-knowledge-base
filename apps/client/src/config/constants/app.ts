import type { DropdownOption } from 'naive-ui';

/**
 * @zh_CN 登录页面 url 地址
 */
export const LOGIN_PATH = '/login';

/**
 * @zh_CN 默认首页地址
 */
export const DEFAULT_HOME_PATH = '/dashboard/analytics';

export type LanguageOption = DropdownOption & {
  key: 'en-US' | 'zh-CN';
  label: string;
};

/**
 * Supported languages
 */
export const SUPPORT_LANGUAGES: LanguageOption[] = [
  { label: '简体中文', key: 'zh-CN' },
  { label: 'English', key: 'en-US' },
];

/**
 * KeepAlive 缓存组件上限。超过这个数会按 LRU 移除最早未活跃的组件实例，
 * 避免长时间运行的页签场景下内存无界增长（Vue 自身没有缓存上限）。
 * 与多 tab 数 maxCount 在 preferences.tabbar 中独立 — 这里只控渲染层。
 */
export const KEEP_ALIVE_MAX = 20;
