---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 删除 KB prompt 里强制输出空回复句的指令

- `KB_CHAT_PROMPT` 第 5 条原要求 LLM 在"全部知识库无关"时输出 `"知识库中未找到您要的答案！"`，模型把它当兜底语过度执行，已成功回答时也会追加。
- 删掉该指令，统一交由 RAGFlow `empty_response` 配置在召回为空时自动兜底，避免 LLM 介入的副作用。
- 第 5 条改为只保留"未提及的事实绝不编造、明确说未给出"的语义，新增 spec 锁定 prompt 不含禁用句。
