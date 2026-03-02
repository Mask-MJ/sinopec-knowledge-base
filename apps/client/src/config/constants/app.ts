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
