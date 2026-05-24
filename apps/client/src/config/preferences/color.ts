import type {
  NaiveColorAction,
  NaiveColorKey,
  ThemeColor,
  ThemeColorKey,
  ThemeColors,
  ThemePaletteColor,
} from './types';
import type { GlobalThemeOverrides } from 'naive-ui';

import { TinyColor } from '@ctrl/tinycolor';
import { getColors } from 'theme-colors';

import { themeVars } from './vars';

function getPaletteColorByNumber(color: string, number: number): string {
  const theme = getColors(new TinyColor(color).toHexString());
  return theme[number] || color;
}

function getNaiveThemeColors(colors: ThemeColor) {
  const colorActions: NaiveColorAction[] = [
    { handler: (color) => color, scene: '' },
    { handler: (color) => getPaletteColorByNumber(color, 400), scene: 'Suppl' },
    { handler: (color) => getPaletteColorByNumber(color, 400), scene: 'Hover' },
    {
      handler: (color) => getPaletteColorByNumber(color, 700),
      scene: 'Pressed',
    },
    { handler: (color) => color, scene: 'Active' },
  ];

  const themeColors: Partial<Record<NaiveColorKey, string>> = {};
  const colorEntries = Object.entries(colors) as [ThemeColorKey, string][];

  colorEntries.forEach(([key, color]) => {
    colorActions.forEach(({ handler, scene }) => {
      themeColors[`${key}Color${scene}`] = handler(color);
    });
  });

  return themeColors;
}

/**
 * Get naive theme
 *
 * @param colors Theme colors
 */
export function getNaiveTheme(colors: ThemeColor) {
  const { primary: colorLoading } = colors;

  const theme: GlobalThemeOverrides = {
    common: {
      ...getNaiveThemeColors(colors),
      borderRadius: '6px',
    },
    LoadingBar: {
      colorLoading,
    },
    Tag: {
      borderRadius: '6px',
    },
  };

  return theme;
}

/**
 * Create theme palette colors
 *
 * @param colors Theme colors
 */
function createThemePaletteColors(colors: ThemeColor) {
  const colorKeys = Object.keys(colors) as ThemeColorKey[];
  const colorPaletteVar = {} as ThemePaletteColor;

  colorKeys.forEach((key) => {
    const theme = getColors(
      new TinyColor(colors[key]).toHexString(),
    ) as ThemeColors;
    colorPaletteVar[key] = theme[500];
    Object.entries(theme).forEach(([number, hex]) => {
      colorPaletteVar[`${key}-${number}` as keyof ThemePaletteColor] = hex;
    });
  });

  return colorPaletteVar;
}

/**
 * create theme token css vars value by theme settings
 *
 * @param colors Theme colors
 */
export function createThemeToken(colors: ThemeColor) {
  const paletteColors = createThemePaletteColors(colors);

  const themeTokens = {
    colors: {
      ...paletteColors,
      nprogress: paletteColors.primary,
      container: 'rgb(255, 255, 255)',
      layout: 'rgb(247, 250, 252)',
      inverted: 'rgb(0, 20, 40)',
      'base-text': 'rgb(31, 31, 31)',
    },
    boxShadow: {
      header: '0 1px 2px rgb(0, 21, 41, 0.08)',
      sider: '2px 0 8px 0 rgb(29, 35, 41, 0.05)',
      tab: '0 1px 2px rgb(0, 21, 41, 0.08)',
    },
  };

  const darkThemeTokens = {
    colors: {
      ...themeTokens.colors,
      container: 'rgb(28, 28, 28)',
      layout: 'rgb(18, 18, 18)',
      'base-text': 'rgb(224, 224, 224)',
    },
    boxShadow: {
      ...themeTokens.boxShadow,
    },
  };

  return {
    themeTokens,
    darkThemeTokens,
  };
}

/**
 * Get css var by tokens
 *
 * @param tokens Theme base tokens
 */
export function getCssVarByTokens(
  tokens: Record<string, Record<string, string>>,
) {
  const styles: string[] = [];
  function removeVarPrefix(value: string) {
    return value.replace('var(', '').replace(')', '');
  }

  function removeRgbPrefix(value: string) {
    return value.replace('rgb(', '').replace(')', '');
  }
  for (const [key, tokenValues] of Object.entries(themeVars)) {
    for (const [tokenKey, tokenValue] of Object.entries(tokenValues)) {
      let cssVarsKey = removeVarPrefix(tokenValue);
      let cssValue = tokens[key]?.[tokenKey] ?? '';

      if (key === 'colors') {
        cssVarsKey = removeRgbPrefix(cssVarsKey);
        const { r, g, b } = new TinyColor(cssValue).toRgb();
        cssValue = `${r} ${g} ${b}`;
      }
      styles.push(`${cssVarsKey}: ${cssValue}`);
    }
  }
  const styleStr = styles.join(';');
  return styleStr;
}
