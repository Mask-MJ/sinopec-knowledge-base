---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore nothink -->

fix(@sinopec-kb/server): 关闭新建助手的思考模式默认值，防止思考内容漏出与答案被截断

现网 Xinference 挂的 `qwen3.6`（35B-A3B MoE，hybrid reasoning）默认开思考，实测出现两个客户可见问题：

1. **思考过程被当成正文输出**：模型把 `Here's a thinking process: ...` 直接写进 `content`（而非 `reasoning_content` 字段），客户在前端看到一大段英文思考流程。
2. **正式答案被截断**：思考 + 抽风重复词把 `max_tokens=1024` 吃光，`finish_reason=length`，正文常常断在半句话。

本 PR 把两处默认值改成开箱能用的组合：

- `DEFAULT_ASSISTANT_MAX_TOKENS`: `1024` → `8192`（qwen3.6 context 262144，8192 完全富裕）
- `DEFAULT_ASSISTANT_SYSTEM_PROMPT` 末尾追加 `/no_think`（qwen3 系列约定关键字，模型识别后跳过思考）

Xinference 直连验证：`finish_reason=stop`、`reasoning_content` 空、`content` 直出干净中文答案、无 `准确反映准确反映` 抽风。

已存在的 10 条 qwen3.6 dialog 已用 SQL 同步修复（`/root/ragflow-backup/pre-nothink-*.sql` 备份），本 PR 只影响**新建**助手，中期换成 `qwen3-30b-a3b-instruct-2507`（纯 instruct，无 thinking 分支）后 `/no_think` 变冗余无害，可延后移除。
