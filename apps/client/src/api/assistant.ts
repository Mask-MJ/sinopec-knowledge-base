import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type AssistantInfo = components['schemas']['AssistantEntity'];
export type SearchParams =
  operations['AssistantController_findAll']['parameters']['query'];
export type SessionInfo = components['schemas']['SessionEntity'];
export type SearchSessionParams =
  operations['AssistantController_findAllSessions']['parameters']['query'];

// 获取助手列表
export function getAssistantList(query?: Partial<SearchParams>) {
  return client.GET('/api/assistant', {
    params: { query: query as SearchParams },
  });
}

// 创建助手
export function createAssistant(
  body: components['schemas']['CreateAssistantDto'],
) {
  return client.POST('/api/assistant', { body });
}

// 获取单个助手信息
export function getAssistantDetail(id: number) {
  return client.GET('/api/assistant/{id}', {
    params: { path: { id } },
  });
}

// 更新助手
export function updateAssistant(
  id: number,
  body: components['schemas']['UpdateAssistantDto'],
) {
  return client.PATCH('/api/assistant/{id}', {
    body,
    params: { path: { id } },
  });
}

// 删除助手
export function deleteAssistant(id: number) {
  return client.DELETE('/api/assistant/{id}', {
    params: { path: { id } },
  });
}

// 创建与聊天助手的会话
export function createChatSession(
  id: number,
  body: components['schemas']['CreateSessionDto'],
) {
  return client.POST('/api/assistant/{id}/sessions', {
    params: { path: { id } },
    body,
  });
}

// 更新与聊天助手的会话
export function updateChatSession(
  id: number,
  sessionId: string,
  body: components['schemas']['UpdateSessionDto'],
) {
  return client.PATCH('/api/assistant/{id}/sessions/{sessionId}', {
    params: { path: { id, sessionId } },
    body,
  });
}

// 获取与聊天助手的会话列表
export function getChatSessionList(id: number, query: SearchSessionParams) {
  return client.GET('/api/assistant/{id}/sessions', {
    params: { path: { id }, query },
  });
}

// 删除与聊天助手的会话
export function deleteChatSession(id: number, sessionId: string) {
  return client.DELETE('/api/assistant/{id}/sessions/{sessionId}', {
    params: { path: { id, sessionId } },
  });
}

// 向指定的聊天助手提问以开始 AI 驱动的对话
export function completions(
  id: number,
  body: components['schemas']['CreateCompletionsDto'],
) {
  return client.POST('/api/assistant/{id}/completions', {
    params: { path: { id } },
    body,
    parseAs: 'stream',
  });
}
