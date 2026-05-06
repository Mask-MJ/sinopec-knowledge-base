---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 修复历史会话点击引用永远显示"未携带引用数据"

- RAGFlow `GET /api/v1/chats/{id}/sessions` 持久化的 `messages[i].reference` 是扁平 chunk 数组，与前端按 SSE 流式格式建模的 `Reference = { chunks, doc_aggs }` 类型不匹配。
- 在 `AssistantService.findAllSessions` 透传层调用新增 `normalizeMessageReferences` 纯函数，把 chunk 数组包装成 `{ chunks, doc_aggs }`，doc_aggs 从 chunks 按 `document_id` 聚合派生，前端零改动恢复引用浮窗。
- 新增 `normalize-reference.ts` 与单测覆盖（doc_aggs 派生 / 缺失字段 / 空数组 / user 透传 / 不可变入参）。
