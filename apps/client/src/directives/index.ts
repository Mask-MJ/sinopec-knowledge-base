import type { App } from 'vue';

import { vPermission } from './permission';

export function setupDirectives(app: App): void {
  app.directive('permission', vPermission);
}
