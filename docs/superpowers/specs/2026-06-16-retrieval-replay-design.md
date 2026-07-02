# 检索回放工具(retrieval-replay)设计

> 状态:已确认设计,待转实现计划。作者会话:2026-06-16。关联文档:[rag-eval-cross-standard-0522-vs-0607.md](../../rag-eval-cross-standard-0522-vs-0607.md) §3。

## 1. 背景与动机

[rag-eval-cross-standard](../../rag-eval-cross-standard-0522-vs-0607.md) §3 把失分题分成三类,其中「顽固检索失败」(Q6/Q18/Q24)与「真回归」(Q14/Q28/Q38/Q39)都被判为**检索召回问题**,但文档里**没有一条 top-k 证据**支撑「命错文档 / 召回错段」的结论——全是从答案质量反推的。

现状梳理(`apps/server/scripts/eval/`,已存在的成熟评测体系):

- `run.ts` 的 `callRetrieval`([run.ts:154](../../../apps/server/scripts/eval/run.ts)) 已调 `POST /api/v1/retrieval`。
- `scoring.ts` 的 `scoreRetrieval` 已算 **MRR / hit@1 / hit@3 / rank / matched**,题集每题带 `reference:{doc,section}` 即 gold。
- 逐题结果落盘 `results/<experimentId>/qNN.json` + `summary.md`。

**两个关键缺陷,正是本工具要补的:**

1. **现有指标是文档级**:`scoreRetrieval` 只比 `documentName`(`normalizeDocName` 归一后互相包含),不看 chunk 内容。会**假阳性**——示例 [results/prod-v2-topn10/q14.json](../../../apps/server/scripts/eval/results/prod-v2-topn10/q14.json):`hit@1=1`(正确文档排第 1)但 `finalScore=0.3 criticalMissing`(对文档却缺/错段落)。文档级检索分说「完美命中」,答案却错。
2. **原文已丢**:`callRetrieval` 在映射 chunk 时只保留 `documentName + 三个相似度`,丢掉了 `content` 与 `important_keywords`。所以现有 `results/*.json` 里**没有 chunk 原文**,无法靠渲染老结果补救,必须重新调一次 retrieval 并保留完整 chunk。

**目标(单一职责)**:对指定题目,dump 出 RAGFlow 实际召回的 top-k chunk 完整证据(原文 + 来源文档 + `important_keywords` + 三分 + 高亮),渲染成带 top_n 截断线与 gold 标注的逐题 markdown,让人**肉眼一眼分清**:① 根本没召回到对的块;② 召回了但排在 top_n 截断线之外;③ 召回对文档但错段落。

**非目标(YAGNI)**:不做自动语义命中判断、不做多配置对照、不调 chat、不判答案分、不连数据库、不进 server 运行时、不加 UI。

## 2. 形态与放置(已决策)

**独立只读脚本**,与 `run.ts` 平行,放 `apps/server/scripts/eval/`:

- `retrieval-replay.lib.ts` —— 纯函数库(body 构造 / chunk 映射 / 截断 / gold 标注 / markdown 渲染 / id 解析),无副作用,可单测。
- `retrieval-replay.ts` —— 主脚本(arg 解析 / env 与黑名单校验 / `api()` / config 与题集加载 / 编排 / 写盘)。
- `retrieval-replay.lib.spec.ts` —— vitest 单测(与现有 `judge.spec.ts`/`scoring.spec.ts` 同目录同风格)。

**决策理由**:`run.ts` 已稳定、`results/` 已积累,回放是临时诊断工具。独立脚本零侵入核心评测器、不污染已积累结果、职责单一可独立演进。代价是 config/api 加载逻辑轻度重复(~40 行),可接受。

**复用现有资产**:

- `scoring.ts` 的导出纯函数:`normalizeDocName`、`scoreRetrieval`、类型 `ChunkRef`/`QuestionRef`。
- config 格式(`ExperimentConfig`:`datasetIds` / `retrieval` / `dataset` / `experimentId` / `split`)。
- 题集格式(`dataset/questions*.json`:`questions[]` 带 `id`/`topic`/`question`/`reference`,`splits{dev,holdout}`)。
- `.env.eval`(`RAGFLOW_HOST` / `RAGFLOW_API_KEY` / `RAGFLOW_PROD_KEY_BLACKLIST`)与 `dotenvx` 运行模式。
- `api()` fetch 封装、`PROD_BLACKLIST` 生产 key 拒跑保护(从 `run.ts` 复制同款实现)。

## 3. 题号映射(失败题落到两套题集 / 两个 KB)

宋工/文档表的 50 题就是 eval 题集,拆成两套:

| 文档表编号 | eval 题集 | 局部 id | KB(datasetId) | config |
| --- | --- | --- | --- | --- |
| Q1–Q20 | `questions.json` | 1–20 一一对应 | 0420 KB `6ec4…` | `configs/prod-v2-topn10.json` |
| Q21–Q50 | `questions-0520.json` | `Q − 20` | 0520 KB `e6a7…` | `configs/0520-baseline.json` |

锚点已核验:文档表 Q6/Q14/Q18 = `questions.json` id 6/14/18;Q38 = `questions-0520.json` id 18。

**§3 失败题的运行映射**:

- 0420 KB:Q6→id6、Q14→id14、Q18→id18 → `--config configs/prod-v2-topn10.json --ids 6,14,18`
- 0520 KB:Q24→id4、Q28→id8、Q38→id18、Q39→id19 → `--config configs/0520-baseline.json --ids 4,8,18,19`

(全局编号 → 0520 局部 id 公式:`localId = globalQ − 20`。)

## 4. 命令行接口

```
dotenvx run --env-file=.env.eval -- tsx scripts/eval/retrieval-replay.ts \
  --config <path> [--ids 6,14,18] [--k 30]
```

- `--config <path>`(必填):复用现有 experiment config。`datasetIds` 与检索参数全取自该文件。
- `--ids <csv>`(可选):局部题号子集(如 `6,14,18`)。缺省时按 `config.split`(同 `run.ts` 的 split 语义,`all`/`dev`/`holdout`)。
- `--k <int>`(可选,默认 30):retrieval 的 `page_size`,**刻意取大于生产 `topN`**,以便看到截断线之外的召回。

本机注意:`RAGFLOW_HOST` 需指向 tailnet ragflow(`http://ragflow:9380`),`.env.eval` 已有同款约定(见 `package.json` 的 `eval:run:*` 脚本)。

## 5. 数据流(每题)

```
question
  → POST /api/v1/retrieval {
      question, dataset_ids: cfg.datasetIds,
      top_k: cfg.retrieval.topK ?? 1024,
      similarity_threshold: cfg.retrieval.similarityThreshold ?? 0.2,
      vector_similarity_weight: cfg.retrieval.vectorSimilarityWeight ?? 0.3,
      keyword: cfg.retrieval.keyword ?? false,
      rerank_id?: cfg.retrieval.rerankId,
      page: 1, page_size: k, highlight: true
    }
  → data.chunks[] (完整保留)
  → mapChunk: { rank, documentName, content, importantKeywords[],
                similarity, vectorSimilarity, termSimilarity, positions? }
  → renderQuestionSection(题, reference, chunks, topN=cfg.retrieval.topN, k)
```

**字段别名稳健性**:RAGFlow 不同版本字段名有出入。`mapChunk` 按优先级兜底取值:

- 文档名:`document_keyword ?? document_name ?? docnm_kwd ?? ''`
- 原文:`content ?? content_with_weight ?? ''`
- 关键词:`important_keywords ?? important_kwd ?? []`(统一成 `string[]`)
- 高亮:`highlight`(可选)

首次集成验证时核对实际返回字段,如有新别名补进兜底链。

## 6. 输出格式(markdown 报告)

写到 `results/<experimentId>-replay/replay.md`(沿用 `results/<exp>/` 约定,加 `-replay` 后缀,不与评测结果目录冲突)。

报告头:experimentId、生成时间(由主脚本注入,纯函数不取时钟)、config 检索参数快照、本次题号清单。

每题一节:

```
## Q14 · shunbei43 · rank=1 (gold doc 命中第 1)
**问题**:…
**Gold**:doc=《…顺北43…总结报告》 | section=2.1 施工起止日期;2.3 完成测线长度…
**召回命中**:文档级 hit@1=1 rank=1 / MRR=1.00   ← 复用 scoreRetrieval

| # | sim | vec | term | 来源文档 | gold? | important_keywords | content 摘要 |
|---|----|----|-----|---------|-------|--------------------|-------------|
| 1 | .57| .73| .50 | 顺北43…总结报告 | ✅ | 起止日期,接收点 | …高亮命中词… (截断~200字) |
| …截断线前 10 行(top_n)… |
| ─────────── top_n=10 截断线(以下不进 LLM)─────────── |
| 11| …| …| … | … | … | … | … |

**doc_aggs**(本题召回命中的文档分布):顺北43总结报告×8,顺北43设计×2 …
```

要点:

- 第 `topN` 行后画 `top_n 截断线`,一眼看出对的块在线上还是线下。
- 每行 `gold?` 列:`isGoldDoc(documentName, reference.doc)` 为真打 ✅(复用 `normalizeDocName` 互相包含判断)。section 级仍靠人工对照(`scoreRetrieval` 不做 section)。
- `content 摘要`:`truncateContent`(去换行、截断 ~200 字);若 chunk 有 `highlight` 用高亮文本优先。
- 节尾 `doc_aggs`:来自 RAGFlow 响应的 `doc_aggs`(无则用 chunks 自行聚合),直接暴露「命错文档」。

## 7. 错误处理

- 缺 `--config` / config 文件不存在 / 缺 `RAGFLOW_HOST` / 缺 `RAGFLOW_API_KEY`:启动即 fail-fast(`console.error` + `process.exit(1)`)。
- `API_KEY` 命中 `RAGFLOW_PROD_KEY_BLACKLIST`:拒跑退出(复用 `run.ts` 同款保护,防止连生产库)。
- 单题检索失败(网络 / `code≠0` / 超时):捕获后在该题节内写 `⚠ 检索失败:<message>`,**不中断整批**;结果不可变累积,最后统一写盘。
- `--ids` 含题集中不存在的 id:启动时 fail-fast 报出缺失 id,避免静默漏跑。

## 8. 测试策略(TDD)

纯函数全部进 `retrieval-replay.lib.ts`,由 `retrieval-replay.lib.spec.ts` 覆盖:

- `parseIdList('6,14,18')` → `[6,14,18]`;空串 / 含空格 / 非法值的处理。
- `buildReplayBody(...)`:断言 body 字段与默认值、`page_size=k`、`highlight=true`、`rerank_id` 仅在有值时出现。
- `mapChunk(raw, index)`:给含 `content`/`important_keywords`/三分 的假 raw,断言完整保留、`rank=index+1`、字段别名兜底。
- `truncateContent(text, 200)`:超长截断、换行折叠、短文本原样。
- `isGoldDoc(name, refDoc)`:归一后互相包含为真,无关文档为假,`refDoc` 空时为假。
- `renderQuestionSection(...)`:给假 chunks 断言 markdown 含表头、`top_n 截断线`出现在第 `topN` 行后、gold 行打 ✅、检索失败分支渲染 `⚠`。

IO 部分(`api()` / `callRetrievalFull` / `main` / 写盘)不单测,首次运行时对 0420 三道失败题做一次端到端集成验证。

运行:`pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts`(vitest 已覆盖 `scripts/eval/` 下 spec,见现有 `scoring.spec.ts`)。

## 9. 验收标准

1. `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` 全绿。
2. 跑 0420 失败题(`--config configs/prod-v2-topn10.json --ids 6,14,18`)生成 `results/prod-v2-topn10-replay/replay.md`,每题含完整 top-30 证据 + 截断线 + gold 标注 + doc_aggs。
3. 跑 0520 失败题(`--config configs/0520-baseline.json --ids 4,8,18,19`)同样产出。
4. 至少能据报告对 Q6/Q14/Q18 各下一句结论:「没召回 / 召回排在线外 / 召回对文档错段」。

## 10. 后续(本工具之外,登记备查)

- 评测文档 [rag-eval-cross-standard](../../rag-eval-cross-standard-0522-vs-0607.md) §1 一/§5 那条「补 Recall@k」建议措辞需小修:不是「没有」,而是「已有**文档级** MRR/hit,缺 **chunk 级**证据 + gold 可细到段落」。本 spec 不改那份文档,留作后续 follow-up。
