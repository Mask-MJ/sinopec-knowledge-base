---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 反向移位修复 RAGFlow GET /sessions 的 off-by-one merge bug

实测 RAGFlow `conversation` 表把 messages 和 reference 分两列存，GET API merge 时按顺序把 `ref[i]` 挂到第 i 个 assistant message 上**没跳过开场白**，导致：

- 开场白上挂的实际是 a1 的真实引用
- 每条 assistant 上挂的实际是下一条答案的真实引用
- 最新一条 assistant 因 reference 数组用完而无引用

`normalizeMessageReferences` 改为反向移位：把每条 assistant 上的 chunks 转给下一个 assistant，开场白丢掉自己的，最新一条由倒数第二个 assistant 上的 chunks 补回。所有 reference 正确归位。

不依赖 Redis cache、不需新建 schema、不需 SSE tap —— 数据本来就在 RAGFlow `conversation.reference` 列里，纯透传层修复。
