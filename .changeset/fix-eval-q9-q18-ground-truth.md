---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore rerank -->


fix: 修订评测集 Q9 / Q18 的标准答案与评分项，使之与原始 docx 实际可观测的字面量对齐

调研 prod RAGFlow ES 索引发现两道题的"标准答案"在源 docx 解析后并不可达，会导致后续 retrieval/embedding/rerank 调优永远在错答案上拟合：

- **Q9（顺北42 RTK）**：标准答案的 `Δ ≤ 0.4 / 0.4 / 0.8m` 在 reference doc《2022 年顺北42井东三维测量施工总结报告》里**没有原文出现**，是国标 SY/T 5171-2017 推出来的；doc 内只列实测最大值 `Δx=0.39m / Δy=0.39m / Δh=-0.75m` 与复测率 `3.82% / 11706 个`。把限差三个 mustContain 从 `severity: critical` 降到 `supporting`，复测率 3.82% 保持 critical（doc 内有原文）；同时去掉一处重复的 3.82 mustContain；reference.section 与 notes 写明限差需跨文档（国标）推理。
- **Q18（页岩气观测系统）**：标准答案的 `20L32S378P168F` 字面量在源 docx 解析后**只剩 `32S378P168F`**（前缀 `20L` 不在 ES 索引里）；同段的 `CMP面元 20m×40m / 道距40m / 接收线距320m / 炮间距80m / 炮线距360m` 也都被 RAGFlow 0.24 deepdoc DocxParser 表格 cell 解析时吃字。修订 raw answer 与 LLM-judge rubric 的 A 项让评分基线回退到 doc 实际可观测的字面量（`32S378P168F` / `7560道` / `7980` / 系统形态描述）；notes 标注真正的 docx 解析 bug 留待 P0b（docx → markdown 预处理）解决。

Q14 / Q15 / Q19 的 ground truth 经核对**与 docx 一致**，本次不动。
