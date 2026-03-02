import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type PostInfo = components['schemas']['PostEntity'];
export type CreatePostDto = components['schemas']['CreatePostDto'];
export type UpdatePostDto = components['schemas']['UpdatePostDto'];
export type SearchParams =
  operations['PostController_findWithPagination']['parameters']['query'];

// 获取岗位列表
export function getPostList(query?: SearchParams) {
  return client.GET('/api/system/post', { params: { query } });
}

// 创建岗位
export function createPost(body: CreatePostDto) {
  return client.POST('/api/system/post', { body });
}

// 获取岗位详情
export function getPostDetail(id: number) {
  return client.GET('/api/system/post/{id}', { params: { path: { id } } });
}

// 更新岗位
export function updatePost(body: UpdatePostDto) {
  return client.PATCH('/api/system/post/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}

// 删除岗位
export function deletePost(id: number) {
  return client.DELETE('/api/system/post/{id}', { params: { path: { id } } });
}
