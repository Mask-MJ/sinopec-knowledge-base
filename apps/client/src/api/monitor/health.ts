import type { components } from '#/openapi';

import { client } from '@/utils';

export type HealthEntity = components['schemas']['HealthEntity'];

/** 拉取服务健康状态，含后端版本号（前端版本检查使用） */
export function getHealth() {
  return client.GET('/api/monitor/health');
}
