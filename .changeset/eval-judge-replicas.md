---
'@sinopec-kb/server': minor
---

<!-- cspell:ignore replicas -->

feat(eval): LLM judge 增加 N 次平均消噪

实证 Q18 在同一答案上单次 judge 评分跨次抖动 0.70/0.40/0.70，单次评分噪声大到无法用作实验对照。改为：

- 每次评测对每道 LLM-judge 题串行调用 RAGFlow judge assistant N 次（默认 3 次，可由 `EVAL_JUDGE_REPLICAS` 环境变量覆写，范围 1–20）。串行不并发，避免 RAGFlow rate limit。
- 单次失败（HTTP error / 解析失败）只跳过当次；全部失败才落 `llmJudgeScore = null`。
- 多次原始分数保留为 `llmJudgeReplicas: (number | null)[]` 写入 result file，便于事后审计抖动来源。
- 均值四舍五入到 2 位小数，沿用 `llmJudgeScore` 字段，aggregate / markdown 报表自动复用。

把"跑 N 次 + 解析 + 求均值"的逻辑抽到独立纯函数模块 `scripts/eval/judge.ts`（`parseJudgeScore` / `averageScores` / `runReplicas` / `resolveJudgeReplicas`），新增 25 个 vitest 单测覆盖：3 次成功取均值、全部失败返回 null、部分失败仅对成功取均值、串行执行不并发。
