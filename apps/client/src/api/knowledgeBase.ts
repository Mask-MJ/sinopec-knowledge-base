import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type KnowledgeBaseInfo = components['schemas']['KnowledgeBaseEntity'];
export type SearchParams =
  operations['KnowledgeBaseController_findAll']['parameters']['query'];
export type SearchParamsWithDocument =
  operations['KnowledgeBaseController_findAllDocuments']['parameters']['query'];

// 获取知识库列表
export function getKnowledgeBaseList(query?: SearchParams) {
  return client.GET('/api/knowledge-base/knowledge-base', {
    params: { query },
  });
}

// 创建知识库
export function createKnowledgeBase(
  body: components['schemas']['CreateKnowledgeBaseDto'],
) {
  return client.POST('/api/knowledge-base/knowledge-base', { body });
}

// 获取单个知识库信息
export function getKnowledgeBaseDetail(id: number) {
  return client.GET('/api/knowledge-base/knowledge-base/{id}', {
    params: { path: { id } },
  });
}

// 更新知识库
export function updateKnowledgeBase(
  body: components['schemas']['UpdateKnowledgeBaseDto'],
) {
  return client.PATCH('/api/knowledge-base/knowledge-base/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}

// 删除知识库
export function deleteKnowledgeBase(id: number) {
  return client.DELETE('/api/knowledge-base/knowledge-base/{id}', {
    params: { path: { id } },
  });
}

// 获取知识库文件列表
export function getKnowledgeBaseFileList(
  id: number,
  query?: SearchParamsWithDocument,
) {
  return client.GET('/api/knowledge-base/knowledge-base/{id}/documents', {
    params: { path: { id }, query },
  });
}

// 下载知识库文件
export function downloadKnowledgeBaseFile(id: number, documentId: string) {
  return client.GET(
    '/api/knowledge-base/knowledge-base/{id}/documents/{documentId}',
    {
      params: { path: { id, documentId } },
      parseAs: 'stream',
    },
  );
}
