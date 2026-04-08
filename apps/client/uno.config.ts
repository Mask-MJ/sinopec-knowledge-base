import {
  defineConfig,
  presetIcons,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

import { themeVars } from './src/config/preferences/vars';

/**
 * 菜单中实际使用的图标白名单。
 * 新增菜单图标时同步更新此列表即可。
 */
const menuIcons = [
  'i-ant-design:aim-outlined',
  'i-ant-design:android-filled',
  'i-ant-design:appstore-outlined',
  'i-ant-design:area-chart-outlined',
  'i-ant-design:cloud-server-outlined',
  'i-ant-design:contacts-outlined',
  'i-ant-design:database-outlined',
  'i-ant-design:deployment-unit-outlined',
  'i-ant-design:folder-outlined',
  'i-ant-design:fund-projection-screen-outlined',
  'i-ant-design:gold-twotone',
  'i-ant-design:laptop-outlined',
  'i-ant-design:medicine-box-outlined',
  'i-ant-design:menu-outlined',
  'i-ant-design:message-outlined',
  'i-ant-design:robot-outlined',
  'i-ant-design:setting-outlined',
  'i-ant-design:user-outlined',
  'i-ant-design:usergroup-add-outlined',
];

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
  safelist: [...'prose prose-sm m-auto text-left'.split(' '), ...menuIcons],
});
