import type { components, operations } from '#/openapi';

import { client } from '@/utils';

/** RAGFlow LLM 模型项 */
export interface RagflowLlmItem {
  available: boolean;
  fid: string;
  llm_name: string;
  max_tokens?: number;
  model_type: string;
  status: string;
  tags?: string;
}

// 获取 RAGFlow 已配置的 LLM 模型列表
export async function getLlmList(): Promise<RagflowLlmItem[]> {
  const { data } = await client.GET('/api/knowledge-base/llms' as never);
  return (data as RagflowLlmItem[] | undefined) ?? [];
}

export type KnowledgeBaseInfo = components['schemas']['KnowledgeBaseEntity'];
export type SearchParams =
  operations['KnowledgeBaseController_findAll']['parameters']['query'];
export type SearchParamsWithDocument =
  operations['KnowledgeBaseController_findAllDocuments']['parameters']['query'];

// 获取知识库列表
export function getKnowledgeBaseList(query?: Partial<SearchParams>) {
  return client.GET('/api/knowledge-base', {
    params: { query: query as SearchParams },
  });
}

// 创建知识库
export function createKnowledgeBase(
  body: components['schemas']['CreateKnowledgeBaseDto'],
) {
  return client.POST('/api/knowledge-base', { body });
}

// 获取单个知识库信息
export function getKnowledgeBaseDetail(id: number) {
  return client.GET('/api/knowledge-base/{id}', {
    params: { path: { id } },
  });
}

// 更新知识库
export function updateKnowledgeBase(
  id: number,
  body: components['schemas']['UpdateKnowledgeBaseDto'],
) {
  return client.PATCH('/api/knowledge-base/{id}', {
    body,
    params: { path: { id } },
  });
}

// 删除知识库
export function deleteKnowledgeBase(id: number) {
  return client.DELETE('/api/knowledge-base/{id}', {
    params: { path: { id } },
  });
}

// 获取知识库文件列表
export function getKnowledgeBaseFileList(
  id: number,
  query?: SearchParamsWithDocument,
) {
  return client.GET('/api/knowledge-base/{id}/documents', {
    params: { path: { id }, query },
  });
}

// 删除知识库文档
export function deleteDocuments(id: number, documentIds: string[]) {
  return client.DELETE('/api/knowledge-base/{id}/documents', {
    params: { path: { id } },
    body: { documentIds },
  });
}

// 上传文件到知识库
export async function uploadKnowledgeBaseDocuments(
  id: number,
  files: File[],
): Promise<unknown> {
  const userStore = useUserStore();
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const response = await fetch(`/api/knowledge-base/${id}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userStore.token.accessToken}`,
    },
    body: formData,
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as null | {
      message?: string | string[];
    };
    const raw = errBody?.message ?? '上传失败';
    throw new Error(Array.isArray(raw) ? raw.join(', ') : raw);
  }
  return response.json();
}

// 更新知识库文档
export function updateDocument(
  id: number,
  documentId: string,
  body: components['schemas']['UpdateDocumentDto'],
) {
  return client.PATCH('/api/knowledge-base/{id}/documents/{documentId}', {
    params: { path: { id, documentId } },
    body,
  });
}

// 切换文档启用状态
export function toggleDocumentStatus(
  id: number,
  documentId: string,
  status: '0' | '1',
) {
  return client.PATCH(
    '/api/knowledge-base/{id}/documents/{documentId}/status',
    {
      params: { path: { id, documentId } },
      body: { status },
    },
  );
}

// 解析文档
export function parseDocuments(id: number, documentIds: string[]) {
  return client.POST('/api/knowledge-base/{id}/parse', {
    params: { path: { id } },
    body: { documentIds },
  });
}

// 停止解析文档
export function stopParseDocuments(id: number, documentIds: string[]) {
  return client.DELETE('/api/knowledge-base/{id}/parse', {
    params: { path: { id } },
    body: { documentIds },
  });
}

// 下载知识库文件
export function downloadKnowledgeBaseFile(id: number, documentId: string) {
  return client.GET('/api/knowledge-base/{id}/documents/{documentId}', {
    params: { path: { id, documentId } },
    parseAs: 'stream',
  });
}
