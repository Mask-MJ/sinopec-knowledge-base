---
'@sinopec-kb/server': minor
---

feat(@sinopec-kb/server): 通用助手默认模型支持通过环境变量 `ASSISTANT_DEFAULT_MODEL` 配置（格式 `<llm_name>@<provider_id>`），未配置时回退到 `gpt-oss@Xinference`。解决"通用聊天无法使用"——之前模型 ID 硬编码，遇到 RAGFlow 实例没有该模型时直接失败。
