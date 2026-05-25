---
'@sinopec-kb/server': minor
---

feat(@sinopec-kb/server): 通用助手默认模型解析策略升级。优先级：① 用户传入 `dto.modelName` → ② 环境变量 `ASSISTANT_DEFAULT_MODEL`（格式 `<llm_name>@<provider_id>`）→ ③ 从 RAGFlow `GET /v1/llm/list` 自动挑选首个可用 chat 模型。彻底删除硬编码 fallback `gpt-oss@Xinference`，与 embedding 模型"前端从列表选"的模式对齐。RAGFlow 未挂载任何可用 chat 模型时抛 503，给出明确指引而非静默使用错模型 ID。
