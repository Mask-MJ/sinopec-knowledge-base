import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type BuyerInfo = components['schemas']['BuyerEntity'];
export type SearchParams =
  operations['BuyerController_findWithPagination']['parameters']['query'];

// 获取买家列表（分页）
export function getBuyerList(query?: SearchParams) {
  return client.GET('/api/erp/buyer', { params: { query } });
}

// 获取单个买家详情
export function getBuyerDetail(id: number) {
  return client.GET('/api/erp/buyer/{id}', { params: { path: { id } } });
}
