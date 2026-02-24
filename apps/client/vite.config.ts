import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from '@sinopec-kb/vite-config';

export default defineConfig(() => {
  return Promise.resolve({
    vite: {
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('src', import.meta.url)),
        },
      },
    },
  });
});
