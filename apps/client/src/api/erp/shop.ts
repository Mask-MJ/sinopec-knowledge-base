import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type CreateShopDto = components['schemas']['CreateShopDto'];
export type ShopInfo = components['schemas']['ShopEntity'];
export type UpdateShopDto =
  operations['ShopController_update']['requestBody']['content']['application/json'];
export type SearchParams =
  operations['ShopController_findWithPagination']['parameters']['query'];
export type ShopAnalytics = components['schemas']['ShopAnalyticsEntity'];

// 获取店铺列表
export function getShopList(query?: SearchParams) {
  return client.GET('/api/erp/shop', { params: { query } });
}
// 创建店铺
export function createShop(body: CreateShopDto) {
  return client.POST('/api/erp/shop', { body });
}
// 获取单个店铺信息
export function getShopDetail(id: number) {
  return client.GET('/api/erp/shop/{id}', { params: { path: { id } } });
}
// 更新店铺信息
export function updateShop(id: number, body: UpdateShopDto) {
  return client.PATCH('/api/erp/shop/{id}', { body, params: { path: { id } } });
}
// 删除店铺
export function deleteShop(id: number) {
  return client.DELETE('/api/erp/shop/{id}', { params: { path: { id } } });
}
