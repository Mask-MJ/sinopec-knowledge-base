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

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const usePreferencesStore = defineStore('preferences-store', () => {
  const state = ref<Preferences>(initPreferences());
  const { css } = useStyleTag('', { id: 'theme-vars' });
  // 更新偏好设置
  const updatePreferences = (preferences: DeepPartial<Preferences>) => {
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
  const setThemeColor = (preset: BuiltinThemePreset) => {
    updatePreferences({
      theme: { primary: preset.color, builtinType: preset.type },
    });
  };

  const setThemeMode = () => {
    const newMode = isDarkTheme.value ? 'light' : 'dark';
    updatePreferences({ theme: { mode: newMode } });
    useDark().value = newMode === 'dark';
  };

  const setAuthPageLayout = (value: AuthPageLayoutType) => {
    updatePreferences({
      app: { authPageLayout: value },
    });
  };

  const setLanguage = async (value: SupportedLanguagesType) => {
    if (!value) return;
    updatePreferences({ app: { locale: value } });
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
