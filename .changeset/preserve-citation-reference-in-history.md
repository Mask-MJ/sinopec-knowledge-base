---
'@sinopec-kb/client': patch
---

fix(@sinopec-kb/client): 修复历史会话点击引用永远显示"加载中"

- `useChat.initMessages` 在重建消息时显式保留 `reference` 字段，避免 RAGFlow 返回的引用块在历史会话恢复后被丢弃。
- `ChatPanel` 的 `props.messages` 类型补 `reference?: Reference`，让上游传入的引用数据能透传到 `ChatBubble`。
- `CitationPopover` 区分两种缺失态：`reference` 整体不存在 → "该消息未携带引用数据"；`reference` 存在但 `chunks[index]` 越界 → "未找到对应引用片段"，移除会让用户误以为正在异步加载的 `referenceLoading` 文案。
- 同步更新 zh-CN / en-US 的 i18n 文案。
