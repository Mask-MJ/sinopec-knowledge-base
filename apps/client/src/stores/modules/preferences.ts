import type {
  AuthPageLayoutType,
  BuiltinThemePreset,
  Preferences,
  SupportedLanguagesType,
  ThemeColor,
} from '@/config/preferences';

import { useStyleTag } from '@vueuse/core';
import { merge } from 'lodash-es';
import { defineStore } from 'pinia';

import {
  createThemeToken,
  DEFAULT_PREFERENCES,
  getCssVarByTokens,
  initPreferences,
} from '@/config/preferences';
import { loadLocaleMessages } from '@/locales';

export const usePreferencesStore = defineStore('preferences-store', () => {
  const state = ref<Preferences>(initPreferences());
  const { css } = useStyleTag('', { id: 'theme-vars' });
  // 更新偏好设置
  const updatePreferences = (preferences: Partial<Preferences>) => {
    state.value = merge({}, state.value, preferences);
  };
  // 重置偏好设置
  function resetState() {
    state.value = DEFAULT_PREFERENCES;
  }
  // 设置主题颜色, 注入全局css变量
  function setupThemeVarsToGlobal(val: ThemeColor) {
    const { themeTokens, darkThemeTokens } = createThemeToken(val);
    const cssVarStr = getCssVarByTokens(themeTokens);
    const darkCssVarStr = getCssVarByTokens(darkThemeTokens);
    css.value = `:root{${cssVarStr}} html.dark{${darkCssVarStr}}`;
  }

  const themeColors = computed(() => {
    const { error, info, primary, success, warning } = state.value.theme;
    return { error, info, primary, success, warning };
  });
  // 当前主题是否为暗黑模式
  const isDarkTheme = computed(() => state.value.theme.mode === 'dark');
  // 设置主题颜色
  const setThemeColor = (preset: BuiltinThemePreset) => {
    state.value.theme.primary = preset.color;
    state.value.theme.builtinType = preset.type;
  };
  // 切换主题模式
  const setThemeMode = () => {
    state.value.theme.mode = isDarkTheme.value ? 'light' : 'dark';
    useDark().value = isDarkTheme.value;
  };
  // 设置认证页面布局
  const setAuthPageLayout = (value: AuthPageLayoutType) => {
    state.value.app.authPageLayout = value;
  };
  // 设置语言
  const setLanguage = async (value: SupportedLanguagesType) => {
    if (!value) return;
    state.value.app.locale = value;
    await loadLocaleMessages(value);
  };

  watch(
    themeColors,
    (val) => {
      setupThemeVarsToGlobal(val);
    },
    { immediate: true },
  );

  return {
    state,
    $reset: resetState,
    updatePreferences,
    isDarkTheme,
    setThemeColor,
    setThemeMode,
    setAuthPageLayout,
    setLanguage,
  };
});
