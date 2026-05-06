---
'@sinopec-kb/server': patch
'@sinopec-kb/client': patch
---

fix: 修复开场白下挂"参考来源"列表 + user 头像底色不对

- `normalizeMessageReferences` 在第一条 user 消息之前的 assistant 消息（即开场白）一律丢弃 reference。RAGFlow 偶尔会把 reference 错挂到开场白上（quirk），开场白文本里没有 [ID:N] 标记，但前端 `ReferenceSourceList` 仍会无条件渲染 doc_aggs 列表，导致用户在 "你好！我是你的助理" 下看到一堆参考来源。
- `ChatBubble.vue` user 头像加 `.user-avatar` 类，背景设为白色 + 浅边框；之前 Naive UI 默认的灰色底压在中石化品牌透明 logo 下，视觉上与品牌色冲突。
