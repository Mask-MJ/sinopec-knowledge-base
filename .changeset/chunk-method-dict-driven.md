---
'@sinopec-kb/client': patch
---

refactor: 知识库分块方式下拉改为字典驱动 + 修复字段名 bug

- `index.page.vue` 启动时通过 `getDictDataList({ dictValue: 'knowledgeBase.chunkMethod' })` 拉取字典，替换原先硬编码的 6 项 select options；表格列同步用字典 name 渲染。
- 顺修一个隐藏 bug：表单 `path="chunk_method"` / 表格 `key: 'chunk_method'` 与 DTO/实体字段 `chunkMethod` 不一致，导致用户的下拉选择从未真正持久化（永远落到 DTO 默认值 `'naive'`）；现统一为 `chunkMethod`。
- 清理 i18n 中已被字典取代的 6 条描述（保留 `chunk_method.title`）。
- 更早的拼写错误 `naïve`（带变音符 ï）一并修正为 ASCII `naive`，与 RAGFlow 公开接口枚举一致。
