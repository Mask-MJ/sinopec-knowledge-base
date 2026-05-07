---
'@sinopec-kb/client': patch
---

fix: 修复知识库新增/编辑表单 `parser_config` 字段名不一致导致整段配置被丢弃的 bug

`apps/client/src/views/knowledgeBase/index.page.vue` 中 PDF 解析器、建议分块大小、分段标识符三个 `pro-*` 组件的 `path` 写为 `parser_config.*`（snake_case），但后端 `CreateKnowledgeBaseDto` / `UpdateKnowledgeBaseDto` 的字段名是 `parserConfig`（camelCase）。`pro-modal-form` 提交时序列化为 `{ parser_config: {...} }`，被 NestJS 的 `class-validator` 在白名单转换阶段静默丢弃，于是用户在 UI 上为新建知识库选择的 `layout_recognize` / `chunk_token_num` / `delimiter` 永远不会生效——RAGFlow 始终用 manual/naive parser 的内置默认值切片。

跟 d8fdf5f / b2413e0 修过的 `chunk_method` → `chunkMethod` 是同类问题，本次把剩下三个字段一并对齐到 `parserConfig.*`。
