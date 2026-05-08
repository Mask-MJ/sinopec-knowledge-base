---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore reparse postmigration topn -->

chore(eval): 在 docx → pandoc 重 ingest 之后做了一轮闭环验证：新增 3 个对照实验配置 + 修订 Q19 rubric

围绕"5 道错题（Q6/Q9/Q14/Q15/Q18/Q19）的归因 + 修复"做了三组对照实验，全部跑在 prod KB（数据集 6ec4cd18，已经走完 docx→md 迁移）：

| experiment | 关键差异 | 总均分 | Q6 | Q9 | Q14 | Q15 | Q18 | Q19 |
| --- | --- | --: | --: | --: | --: | --: | --: | --: |
| prod-v2-postmigration | 迁移后即刻 | 75.0% | 0.00 | 0.50 | 0.30 | 1.00 | 0.70 | 0.75 |
| prod-v2-after-reparse | 6 份 .md doc 一份份串行重 parse 重建 RAPTOR/GraphRAG | 75.2% | 0.00 | 0.50 | 0.30 | 1.00 | 0.40 | 0.60 |
| prod-v2-topn10 | top_n 6 → 10 | **77.9%** | **0.30** | **1.00** | 0.30 | 1.00 | **0.70** | **0.70** |

主要发现：

- **Q6 retrieval 偏差需要靠 top_n 救**。RAPTOR 重建对 Q6 没用——chunks 与摘要都在，但 embedding 把"一升一降三确保具体指什么"判定为更接近"施工难点（风季沙尘暴）"段；只有把 top_n 提到 10，正确 chunk 才进 LLM prompt。
- **Q9 / Q18 被 docx→md 重 ingest 救起来了**。前者复测率 3.82% 命中后 mc 直接满分；后者拿到了"32S378P168F / 7560 道 / 17460 道 / 168 次覆盖"等真实参数。
- **Q14 是 LLM disambiguation 问题**，retrieval 调参修不了，需要 prod assistant prompt 工程介入。
- **LLM judge 单次评分有显著噪声**（Q18 在 after-reparse 上从 0.70 摆到 0.40，再到 topn10 又回 0.70；同 prompt 答案几乎一致），单次跑分不可全信，建议后续平均 N 次。
- **Q19 rubric 改动**：原 rubric 只卡定性词，导致 LLM 答出"山区"无关数字（350-800 / 1000-2400 / 3300-5400）也能拿 0.75；docx→md 修复让 LLM 拿到真值（0-4m / 395-1000 / 1200-3000 / 3400-5700）反而看不到收益。新 rubric 拆 A 定性 (0.4) + B 数值 (0.6)，并明确"答出他区域数据 → B = 0"，让 ingestion 修复体现在分数上。

副作用：Q8 在 topn10 下从 0.83 → 0.00。原因是 prod KB 没有"顺北42井东观测系统"那段，top_n=6 时 retrieval 把 43井东的同模式参数 chunk 顶上去，LLM 复述后碰巧命中 mustContain；top_n=10 时召回了 42井东 doc 内"未给出"的段，LLM 老实地说没有。这是另一类评测集 ground-truth 跨文档引用问题（同 Q9 / Q15），属于 follow-up，跟 retrieval 调参无关。

入库的 3 份 config 仅用于复现本轮实验，不影响生产参数。如果未来要落地 top_n=10 还需另起 PR 改 prod assistant 配置。
