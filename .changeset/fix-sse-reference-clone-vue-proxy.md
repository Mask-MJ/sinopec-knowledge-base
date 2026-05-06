---
'@sinopec-kb/client': patch
---

fix(@sinopec-kb/client): 流式答完点 [N] 引用永远显示"未携带引用数据"

`useChat` watcher 在流式结束时调 `structuredClone(sseStream.reference.value)`，但 `sseStream.reference` 是 `readonly()` 包装的 Vue 3 Proxy，`structuredClone` 在 Proxy 上抛 `DataCloneError: Object could not be cloned`，watcher 静默失败 → message.reference 永远没 attach。

实测浏览器内 SSE 数据完整无缺（chunks 6 / doc_aggs 3 全部到达），server 透传正常，只是前端 clone 路径炸了。修复：先 `toRaw()` 解包再 `structuredClone`。
