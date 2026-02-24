import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@/': new URL('src/', import.meta.url).pathname,
      'src/': new URL('src/', import.meta.url).pathname,
    },
  },
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    root: './',
  },
});
