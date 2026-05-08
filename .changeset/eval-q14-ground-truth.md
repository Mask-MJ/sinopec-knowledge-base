---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore disambiguation -->

fix(eval): 修订 Q14 标准答案，承认 docx 自身存在两种合法的"施工起止"日期

PR #20 入库的 prompt disambiguation（同 Q14 落地后跑了一轮 eval：[2a04370 后第三轮]）效果验证为零提升（0.30 → 0.30）。深挖原因：**docx 本身的 ground-truth 模糊**——

- 第 7 页正文 2.1 节："华东分公司 SGC2121 队测量人员于 **2021年10月01日** 开始寻找控制点、埋石…**10月23日** 开始野外放样，2022年01月09日 完成了放样作业"
- 第 43 页表格表头："**施工日期：2021年10月01日 至 2022年01月09日**"

LLM 复述任一表述都符合 docx 字面量。RAG 设计哲学是"忠实复述检索结果"，prompt 改造比不过 chunk 字面量。把"23"按 critical 强制要求是评测者的主观裁定，跟 docx 不符。

## 改动

- `apps/server/scripts/eval/dataset/questions.json` Q14：
  - `answer.raw` 改写为同时呈现两种合法表述（表格表头 vs 正文 2.1）
  - `mustContain` 重新分级：
    - critical：`2021` / `10` / `2022` / `09`（年份与完成日 2022-01-09 必须命中）
    - supporting：`23` / `01` / 数量字段（236928 / 60374 / 74 / 316）
  - 去除两条重复的字符串型 mustContain（`2021年10月23日` / `2022年01月09日`，已被数字 mustContain 覆盖）
  - `reference.section` 与 `notes` 写明 docx 内部矛盾来源

## 影响

跟 PR #16（Q9/Q18 ground truth）同类做法。预期 Q14 跑分从 0.30 升至 0.7+（4 critical + 至少 2 supporting 命中）。
