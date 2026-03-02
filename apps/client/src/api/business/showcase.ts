import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type CreateShowcaseDto = components['schemas']['CreateShowcaseDto'];
export type ShowcaseInfo = components['schemas']['ShowcaseEntity'];
export type SearchParams =
  operations['ShowcaseController_findWithPagination']['parameters']['query'];

// 获取橱窗商品列表
export function getShowcaseList(query?: SearchParams) {
  return client.GET('/api/business/showcase', { params: { query } });
}
// 创建橱窗商品
export function createShowcase(body: CreateShowcaseDto) {
  return client.POST('/api/business/showcase', { body });
}
// 获取单个橱窗商品信息
export function getShowcaseDetail(id: number) {
  return client.GET('/api/business/showcase/{id}', {
    params: { path: { id } },
  });
}
// 更新橱窗商品
export function updateShowcase(
  body: components['schemas']['UpdateShowcaseDto'],
) {
  return client.PATCH('/api/business/showcase/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}
// 删除橱窗商品
export function deleteShowcase(id: number) {
  return client.DELETE('/api/business/showcase/{id}', {
    params: { path: { id } },
  });
}
