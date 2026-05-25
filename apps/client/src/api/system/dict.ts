import type { components, operations } from '#/openapi-system';

import { client } from '@/utils';

export type DictInfo = components['schemas']['DictEntity'];
export type DictData = components['schemas']['DictDataEntity'];
export type DictSearchParams =
  operations['DictController_findAll']['parameters']['query'];

export type DictDataInfo = components['schemas']['DictDataEntity'];
export type DictDataSearchParams =
  operations['DictController_findAllData']['parameters']['query'];

// 获取字典列表
export function getDictList(query?: DictSearchParams) {
  return client.GET('/api/system/dict', { params: { query } });
}
// 创建字典
export function createDict(body: components['schemas']['CreateDictDto']) {
  return client.POST('/api/system/dict', { body });
}
// 获取单个字典信息
export function getDictDetail(id: number) {
  return client.GET('/api/system/dict/{id}', { params: { path: { id } } });
}
// 更新字典
export function updateDict(
  id: number,
  body: components['schemas']['UpdateDictDto'],
) {
  return client.PATCH('/api/system/dict/{id}', {
    body,
    params: { path: { id } },
  });
}
// 删除字典
export function deleteDict(id: number) {
  return client.DELETE('/api/system/dict/{id}', { params: { path: { id } } });
}

// 获取字典数据列表
export function getDictDataList(query: DictDataSearchParams) {
  return client.GET('/api/system/dict/data', { params: { query } });
}
// 创建字典数据
export function createDictData(
  body: components['schemas']['CreateDictDataDto'],
) {
  return client.POST('/api/system/dict/data', { body });
}
// 获取单个字典数据信息
export function getDictDataDetail(id: number) {
  return client.GET('/api/system/dict/data/{id}', { params: { path: { id } } });
}
// 更新字典数据
export function updateDictData(
  id: number,
  body: components['schemas']['UpdateDictDataDto'],
) {
  return client.PATCH('/api/system/dict/data/{id}', {
    body,
    params: { path: { id } },
  });
}
// 删除字典数据
export function deleteDictData(id: number) {
  return client.DELETE('/api/system/dict/data/{id}', {
    params: { path: { id } },
  });
}
