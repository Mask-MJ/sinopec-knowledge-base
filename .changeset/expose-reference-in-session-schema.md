---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 在 SessionEntity 中暴露 RAGFlow 引用字段

- 抽出 `ReferenceChunkEntity` / `ReferenceDocAggEntity` / `ReferenceEntity` / `SessionMessageEntity` 显式声明 RAGFlow 在助手消息中携带的引用结构，替代原 `SessionEntity.messages` 的 inline `{content, role}` 类型。
- 让 OpenAPI schema 与运行时透传的数据契约对齐，避免前端因生成类型缺字段而在 `initMessages` 等处把 reference map 丢，导致历史会话点击 `[N]` 引用永远显示"加载中"。
