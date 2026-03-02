import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type CreateOrderDto = components['schemas']['CreateOrderDto'];
export type OrderInfo = components['schemas']['OrderEntity'];
export type UpdateOrderDto =
  operations['OrderController_update']['requestBody']['content']['application/json'];
export type SearchParams =
  operations['OrderController_findWithPagination']['parameters']['query'];

// 获取订单列表（分页）
export function getOrderList(query?: SearchParams) {
  return client.GET('/api/erp/order', { params: { query } });
}

// 创建订单
export function createOrder(body: CreateOrderDto) {
  return client.POST('/api/erp/order', { body });
}

// 获取单个订单详情
export function getOrderDetail(id: number) {
  return client.GET('/api/erp/order/{id}', { params: { path: { id } } });
}

// 更新订单信息
export function updateOrder(id: number, body: UpdateOrderDto) {
  return client.PATCH('/api/erp/order/{id}', {
    body,
    params: { path: { id } },
  });
}

// 删除订单
export function deleteOrder(id: number) {
  return client.DELETE('/api/erp/order/{id}', { params: { path: { id } } });
}

// 订单统计数据
// export function getOrderStatistics(query?: { dateRange?: [string, string]; shopId?: number }) {
//   return client.GET('/api/erp/order/statistics', { params: { query } })
// }
