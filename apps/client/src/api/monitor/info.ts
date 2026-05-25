import type { components } from '#/openapi-monitor';

import { client } from '@/utils';

export type InfoEntity = components['schemas']['InfoEntity'];

// 获取系统运行信息
export function getSystemInfo() {
  return client.GET('/api/monitor/info');
}
