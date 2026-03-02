import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type DeptInfo = components['schemas']['DeptEntity'];
export type SearchParams =
  operations['DeptController_findAll']['parameters']['query'];

// 获取部门列表
export function getDeptList(query?: SearchParams) {
  return client.GET('/api/system/dept', { params: { query } });
}
// 创建部门
export function createDept(body: components['schemas']['CreateDeptDto']) {
  return client.POST('/api/system/dept', { body });
}
// 获取单个部门信息
export function getDeptDetail(id: number) {
  return client.GET('/api/system/dept/{id}', { params: { path: { id } } });
}
// 更新部门
export function updateDept(body: components['schemas']['UpdateDeptDto']) {
  return client.PATCH('/api/system/dept/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}
// 删除部门
export function deleteDept(id: number) {
  return client.DELETE('/api/system/dept/{id}', { params: { path: { id } } });
}

/**
 * 1. 获取列表 用params
 * 2. 创建、更新(先通过id找到)用body
 * 3. 单个详情 | 删除 (先通过id找到)再操作
 */
