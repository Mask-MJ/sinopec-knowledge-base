import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type CreateInfluencerDto = components['schemas']['CreateInfluencerDto'];
export type InfluencerInfo = components['schemas']['InfluencerEntity'];
export type SearchParams =
  operations['InfluencerController_findWithPagination']['parameters']['query'];

// 获取网红账号列表
export function getInfluencerList(query?: SearchParams) {
  return client.GET('/api/business/influencer', { params: { query } });
}
// 创建网红账号
export function createInfluencer(body: CreateInfluencerDto) {
  return client.POST('/api/business/influencer', { body });
}
// 获取单个网红账号信息
export function getInfluencerDetail(id: number) {
  return client.GET('/api/business/influencer/{id}', {
    params: { path: { id } },
  });
}
// 更新网红账号
export function updateInfluencer(
  body: components['schemas']['UpdateInfluencerDto'],
) {
  return client.PATCH('/api/business/influencer/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}
// 删除网红账号
export function deleteInfluencer(id: number) {
  return client.DELETE('/api/business/influencer/{id}', {
    params: { path: { id } },
  });
}
