import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type OperationlogInfo = components['schemas']['OperationLogEntity'];
export type SearchParams =
  operations['OperationLogController_findWithPagination']['parameters']['query'];

// 获取操作日志列表
export function getOperationlogList(query?: SearchParams) {
  return client.GET('/api/monitor/operation-log', { params: { query } });
}
