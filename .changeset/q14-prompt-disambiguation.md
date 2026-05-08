---
'@sinopec-kb/server': minor
---

<!-- cspell:ignore disambiguation RAGFlow shunbei multiturn topn -->

feat(eval): 入库 Q14 日期 disambiguation 修订草案 + ops 脚本，**不直接修改 prod assistant**

## 为什么

Q14（"2022 年顺北 43 井东三维地震勘探项目施工的起止日期…"）在最近三组对照实验里持续 0.30 持平，详情见 PR #18 changeset 表格：

| experiment            |  Q14 |
| --------------------- | ---: |
| prod-v2-postmigration | 0.30 |
| prod-v2-after-reparse | 0.30 |
| prod-v2-topn10        | 0.30 |

retrieval 调参 (top_n / similarity / vector_weight)、chunk_method 切换、docx → pandoc 重 ingest 都改不动这一题——LLM 实际拿到了正确 chunk，但同一段落里同时出现两类日期：

- **项目起止 / 立项**：2021-10-01 项目部组建、寻找控制点、埋石
- **施工 / 野外作业起止**：2021-10-23 开始野外放样、2022-01-09 完成放样作业

LLM 把"项目起止 2021-10-01"当成了用户问的"施工起止"，disambiguation 失败。这是 prompt 工程问题，不是检索问题。

## 这个 PR 改了什么

只入库**两份文件**到仓库，**不修改任何 prod 配置**：

1. `apps/server/scripts/migrate/q14-disambiguation-prompt.md` —— 待追加到 prod assistant system prompt 末尾的文本草案（"日期类问题的回答规范"小节，三类日期定义 + 引用规则）。
2. `apps/server/scripts/migrate/update-prod-assistant-prompt.sh` —— ops 脚本，默认 dry-run（GET prod assistant 当前 prompt → 拼接追加段 → 备份原 prompt 到 `/tmp/prod-assistant-prompt-backup-<ts>.txt` → 显示 unified diff），加 `--apply` 才真 PUT。PUT 字段映射逐字对齐 `apps/server/scripts/eval/run.ts :: syncAssistantConfig`（GET `prompt.prompt` → PUT `prompt_config.system`，其它字段全部从 GET 原样回 PUT，避免漏字段被 RAGFlow 当作"清空"）。

## 落地步骤（运维 / 产品 owner 评审后人工执行）

1. Review 草案文本（`q14-disambiguation-prompt.md` 分隔线之后的正文）
2. 设置 env：`RAGFLOW_HOST` / `RAGFLOW_API_KEY`（默认 `TARGET_ASSISTANT_ID=b7e94c58476611f1a9b8932ed31a3307`，可 env 覆盖）
3. 跑 dry-run：`./apps/server/scripts/migrate/update-prod-assistant-prompt.sh`，评估 unified diff
4. 评审 OK 后再跑 `--apply`
5. 跑 `pnpm -F @sinopec-kb/server tsx apps/server/scripts/eval/run.ts` 复测 Q14 看分数变化

## 风险

- **影响所有 chat 用户的回答风格**：追加的"日期类问题回答规范"是全局规则，会改变所有日期类问询的回答方式（不仅 Q14）。dry-run 必须经产品 owner 评审后再 `--apply`。
- 不在本 PR 内解决：prompt 追加后是否真能把 Q14 拉到 ≥ 0.7 还需评测验证；若失败需进一步迭代 prompt 或考虑 chunk 级前置 disambiguation。
