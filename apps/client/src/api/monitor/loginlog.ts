import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type LoginlogInfo = components['schemas']['LoginLogEntity'];
export type SearchParams =
  operations['LoginLogController_findWithPagination']['parameters']['query'];

// 获取登录日志列表
export function getLoginlogList(query?: SearchParams) {
  return client.GET('/api/monitor/login-log', { params: { query } });
}
