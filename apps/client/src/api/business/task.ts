import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type CreateTaskDto = components['schemas']['CreateTaskDto'];
export type TaskInfo = components['schemas']['TaskEntity'];
export type TaskStatistic = components['schemas']['TaskStatistic'];
export type SearchParams =
  operations['TaskController_findWithPagination']['parameters']['query'];
export type UploadDto = components['schemas']['FilesUploadDto'];

// 获取任务列表
export function getTaskList(query?: SearchParams) {
  return client.GET('/api/business/task', { params: { query } });
}
// 创建任务
export function createTask(body: CreateTaskDto) {
  return client.POST('/api/business/task', { body });
}
// 获取单个任务信息
export function getTaskDetail(id: number) {
  return client.GET('/api/business/task/{id}', { params: { path: { id } } });
}
// 删除任务
export function deleteTask(id: number) {
  return client.DELETE('/api/business/task/{id}', { params: { path: { id } } });
}
// 获取任务统计数据
export function getTaskStatistics() {
  return client.GET('/api/business/task/statistics');
}
