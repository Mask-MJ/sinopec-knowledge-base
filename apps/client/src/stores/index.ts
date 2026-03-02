import type { App } from 'vue';

import { createPinia } from 'pinia';

export * from './modules';

export function initStores(app: App) {
  const pinia = createPinia();
  app.use(pinia);
  return pinia;
}
