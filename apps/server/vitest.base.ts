import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Server Vitest 共享基础配置
 *
 * 被 vitest.config.ts (unit) 和 vitest.config.e2e.ts 共同使用。
 */
export const baseConfig = defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@/': new URL('src/', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    root: './',
  },
});
