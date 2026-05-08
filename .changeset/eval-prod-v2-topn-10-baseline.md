---
'@sinopec-kb/server': patch
---

chore(eval): 把 prod-v2 baseline 的 retrieval.topN 从 6 升到 10

PR #18 在 prod KB 上对 top_n=6 与 top_n=10 做了对照实验，结果显示 top_n=10 让 5 道关心题里 4 道明显提升（Q6 0.00→0.30、Q9 0.50→1.00、Q18 0.40→0.70、Q19 0.60→0.70），总均分 75.2% → 77.9%。Q8 0.83→0.00 的副作用是评测集自身 ground-truth 跨文档引用问题暴露，与 top_n 调整无关。

把 prod-v2 baseline 的 `retrieval.topN` 升到 10 后，后续 eval 跑分将以这个更贴近最佳召回的配置为基线。落地 prod assistant 实例的 PUT 操作需要单独 ops 步骤，本 PR 不涉及。
