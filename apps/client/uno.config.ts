import { icons as antDesign } from '@iconify-json/ant-design';
import {
  defineConfig,
  presetIcons,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

import { themeVars } from './src/config/preferences/vars';

// Todo 全量导入 vite 启动太慢
const IconNames = Object.keys(antDesign.icons).map(
  (iconName) => `i-${antDesign.prefix}:${iconName}`,
);

export default defineConfig({
  presets: [
    presetWind3({ dark: 'class' }),
    presetIcons({
      collections: {
        lucide: () =>
          import('@iconify-json/lucide/icons.json').then((i) => i.default),
        antDesign: () =>
          import('@iconify-json/ant-design/icons.json').then((i) => i.default),
      },
      extraProperties: {
        display: 'inline-block',
      },
    }),
    presetTypography(),
  ],
  theme: {
    ...themeVars,
  },
  shortcuts: [
    ['flex-center', 'flex justify-center items-center'],
    ['flex-between', 'flex justify-between items-center'],
    ['flex-col', 'flex flex-col'],
    ['flex-col-center', 'flex justify-center items-center flex-col'],
    ['text-primary', 'text-[rgb(var(--primary-color))]'],
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  safelist: [...'prose prose-sm m-auto text-left'.split(' '), ...IconNames],
});
