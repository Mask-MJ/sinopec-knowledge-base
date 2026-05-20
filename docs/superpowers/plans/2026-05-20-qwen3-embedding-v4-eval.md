# Qwen3-Embedding (text-embedding-v4) vs bge-m3 0520 A/B Eval Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to drive task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 0520 第二批客户评测知识库上做 embedding 模型 A/B 对照：保留 chunk_method / parser_config / assistant / retrieval 参数完全相同，仅把 KB 的 embedding model 从 `BAAI/bge-m3___OpenAI-API@OpenAI-API-Compatible` 切到 DashScope `text-embedding-v4@Tongyi-Qianwen`（Qwen3-Embedding 系列的云端形态），跑一遍 `questions-0520.json` 全题，与 `0520-baseline` 直接对比 MRR / hit@k / doc-match / answer-final-avg。

**Why now:** PR #24 之后 prod-v2 stack 已锁死 bge-m3（1024 维）+ 当前 retrieval 配置。`text-embedding-v4` 由通义千问基于 Qwen3 LLM 训练，默认输出维度同为 1024（MRL 可降到 64 也可升到 2048），在 MTEB 中文榜上整体高于 bge-m3 一个档位，且接入只需 RAGFlow Tenant 挂上 DashScope API key —— 零部署成本就能拿到一组公平（维度一致）的对照数据。

**Tech Stack:** 复用 `setup-kb-0520.ts`（参数化后）+ `run.ts` + `judge.ts`，不引入新依赖。RAGFlow 走 HTTP API，模型走 DashScope HTTP API。

---

## File Structure

| 文件 | 责任 | 状态 |
|---|---|---|
| `apps/server/scripts/eval/setup-kb-0520.ts` | 加 `--embedding-model` / `--experiment-id` / `--config-filename` / `--dataset-questions` 四个可选参数；不传时行为完全不变 | **已改造** |
| `apps/server/scripts/eval/setup-kb-0520-qwen3.sh` | wrapper：默认 `EMBEDDING_MODEL=text-embedding-v4@Tongyi-Qianwen` + `EXPERIMENT_ID=0520-qwen3-embedding-v4` | **新增** |
| `apps/server/scripts/eval/configs/0520-qwen3-embedding-v4.json` | eval 配置；由 setup 脚本运行结束时**自动写入**（包含真实 datasetId） | 运行期生成 |
| `apps/server/package.json` | 增加 `eval:setup:0520-qwen3` / `eval:run:0520-qwen3` 等四个 npm script 入口 | **已改造** |
| `docs/kb-optimization-report.md` | 补一节"text-embedding-v4 vs bge-m3 @ 0520" | Task 5 输出 |

---

## 已知值

| 项 | 值 | 来源 / 备注 |
|---|---|---|
| RAGFlow embedding model 注册名 | `text-embedding-v4@Tongyi-Qianwen` | **已通过 `GET /v1/llm/list` 验证 available=true**（2026-05-20）|
| 0520-baseline 当前 embedding | `BAAI/bge-m3___OpenAI-API@OpenAI-API-Compatible` | 从 prod-v2 dataset 复制；1024 维 |
| 维度 | 1024（DashScope text-embedding-v4 默认） | 与 bge-m3 一致；A/B 公平对照 |
| 源 dataset id | `6ec4cd18476611f1a9b8932ed31a3307`（prod-v2，借用 chunk_method）| `setup-kb-0520.sh` 同款 |
| Assistant id | `b7e94c58476611f1a9b8932ed31a3307`（prod-v2 assistant）| 评测沿用 |
| 检索参数 | topK=1024 / thr=0.2 / vsw=0.3 / keyword=false / topN=10 | 与 `0520-baseline.json` 完全一致 |
| 题集 | `questions-0520.json` | 与 `0520-baseline` 完全一致 |

---

## Task 1: 前置检查 RAGFlow Tenant 里 text-embedding-v4 可用

**Files:** 无代码修改，纯运维 / 数据检查。

> **状态：已在 2026-05-20 完成。** 远程 RAGFlow (`http://ragflow:9380`) `GET /v1/llm/list` 返回 `Tongyi-Qianwen` provider 下 `text-embedding-v4` available=true。`v2` / `v3` 也都 available（如需做版本横向对比可直接换 `EMBEDDING_MODEL`）。

- [x] **Step 1: 拉 RAGFlow llm 列表，确认 text-embedding-v4 在列且 available**

```bash
# 注意：RAGFlow 内部接口是 /v1/llm/list（不是 /api/v1/llms），返回按 provider 分组
curl -s -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  "$RAGFLOW_HOST/v1/llm/list" \
  | jq -r '.data | to_entries[] | .key as $factory | .value[] | select(.model_type | test("embedding")) | "\($factory)  |  \(.llm_name)  |  available=\(.available)"'
```

- [x] **Step 2: 注册名已确认为 `text-embedding-v4@Tongyi-Qianwen`，wrapper 默认值无需 override。**

⚠️ **`.env.eval` 里的 `RAGFLOW_HOST` 当前是 `http://localhost:9380` 但本机该端口并未开放（实际本机 docker 是 `:59380`，远程评测实例是 `ragflow:9380`）。** 跑 setup / run 前需要确认实际指向的实例 —— 见 Risks 表。

---

## Task 2: 建立 qwen3 对照 KB

**Files:**
- 读：`apps/server/scripts/eval/setup-kb-0520.ts`（已参数化）
- 读：`apps/server/scripts/eval/setup-kb-0520-qwen3.sh`（已新增）
- 写：`apps/server/scripts/eval/configs/0520-qwen3-embedding-v4.json`（脚本自动生成）

- [ ] **Step 1: 在 apps/server 下跑 wrapper**

```bash
cd apps/server
pnpm eval:setup:0520-qwen3
```

预期产出：
- RAGFlow 里出现一个名为 `eval-0520-qwen3-YYYYMMDD-HHMM` 的新 dataset
- 该 dataset 把 0520 全部 8 份业务文档（5 docx → md + 3 pdf）解析完成，所有 doc `run=DONE`
- `apps/server/scripts/eval/configs/0520-qwen3-embedding-v4.json` 文件出现，`datasetIds` 是新建库的 id

- [ ] **Step 2: 解析速度 / 失败情况 check**

DashScope embedding 是 API 调用，受 rate limit 约束。预期单库 8 份文档（≈ 200-400 chunk）全量解析 < 5 min。若超时 / 部分 FAIL，看 RAGFlow web UI 的 doc 详情页拉错误（通常是 DashScope 429 或 key 余额）。

---

## Task 3: 跑评测

**Files:**
- 读：`apps/server/scripts/eval/configs/0520-qwen3-embedding-v4.json`
- 读：`apps/server/scripts/eval/run.ts`
- 写：`apps/server/scripts/eval/results/0520-qwen3-embedding-v4/`

- [ ] **Step 1: 跑 qwen3 实验**

```bash
cd apps/server
pnpm eval:run:0520-qwen3
```

⚠️ **务必避免与 `eval:run:0520-baseline` 并行跑**：两者复用同一个 assistant id，`run.ts:syncAssistantConfig` 会 PUT 覆盖 retrieval / dataset_ids 字段，并行会互相污染。

- [ ] **Step 2: 复跑 baseline 拿干净对照**

若 baseline 结果是几天前跑的、retrieval 参数可能已被其他实验覆盖污染，重跑一次保险：

```bash
cd apps/server
pnpm eval:run:0520-baseline
```

---

## Task 4: 对照分析

**Files:**
- 读：`apps/server/scripts/eval/results/0520-baseline/summary.md`
- 读：`apps/server/scripts/eval/results/0520-qwen3-embedding-v4/summary.md`

- [ ] **Step 1: 横向对比聚合指标**

| 指标 | 0520-baseline (bge-m3, 1024d) | 0520-qwen3-embedding-v4 (1024d) | Δ |
|---|---|---|---|
| MRR | (从 baseline summary 拿) | (从 qwen3 summary 拿) | |
| hit@1 | | | |
| hit@3 | | | |
| doc-match | | | |
| answer-final-avg | | | |

- [ ] **Step 2: 逐题翻翻 retrieval 排名差异**

`per-question` 表里挑 baseline rank > 3 但 qwen3 rank ≤ 3 的题（或反之），看 chunk 内容是不是更对题。这一步才能判断"embedding 是否真在帮忙"，单看聚合分容易被 LLM judge 噪声拉平。

- [ ] **Step 3: cost 估算**

DashScope text-embedding-v4 定价 ¥0.0007/千 token（2026-05 当时价）。0520 库 8 份文档 ≈ 50K token，初次入库 + 一轮评测查询（20 题 × 平均 50 token） ≈ 55K token ≈ ¥0.04。复跑无重新 embedding。可以忽略不计，但记一笔以防后续大规模评测算总账。

---

## Task 5: 把结论写进 kb-optimization-report

**Files:**
- 改：`docs/kb-optimization-report.md`

- [ ] **Step 1: 新增一节 "## text-embedding-v4 vs bge-m3 @ 0520"**

包含：
- 实验目的 / 设定
- 对照表（Task 4 Step 1 那张）
- 判断结论：保留 bge-m3、切换到 v4、或继续做 1536 / 2048 维 follow-up
- 若结论是切换，给出后续生产切换的待办（需要在 prod-v2 KB 上从 bge-m3 重建索引 → cost / 停服窗口估算 → 升级 plan）

---

## Risks / Gotchas

| 风险 | 缓解 |
|---|---|
| ~~RAGFlow embedding model 注册名跟猜测不一致~~ | **已验证**：`text-embedding-v4@Tongyi-Qianwen`（2026-05-20）|
| `.env.eval` 默认 `RAGFLOW_HOST=http://localhost:9380` 在本机不通 | 本机的真实 host 是 `http://ragflow:9380`（Tailscale，远程评测实例）。跑 setup / run 前**必须先 fix .env.eval**，否则连不上。本机 docker 实例在 `:59380`（独立 Tenant + 独立 key，不要混用）|
| DashScope rate limit / 余额耗尽 | Task 2 Step 2 监控；预存 ¥10 足以跑数十轮评测 |
| 并行跑实验污染 assistant 配置 | Task 3 Step 1 显式警告；后续若要并行需先重构 `run.ts` 让 assistant 也参数化 |
| text-embedding-v4 默认 1024 维以外的版本（1536 / 2048）效果可能更好 | 留作 follow-up，本 plan 先把 1024 维公平对照拿到 |
| 评测结论受 LLM judge 噪声影响 | 已有 `EVAL_JUDGE_REPLICAS=3` 平均；如分差 < 3%，需要看逐题 rank 而非只看均值 |

---

## Execution Log (2026-05-20)

**状态：abandoned mid-execution，未拿到 v4 vs bge-m3 实测数字。**

按时间线：

1. ✅ **Task 1（前置校验）完成**：远程 RAGFlow（ECS `iZ2ze8axe2178no0glkw5xZ`，Tailscale `100.64.0.4`）`GET /v1/llm/list` 确认 `text-embedding-v4@Tongyi-Qianwen` available=true；同时 `text-embedding-v2 / v3` 也都 available。
2. ✅ **附加发现：Q12 retrieval rank=0 是 metric bug**。`questions-0520.json` 里 Q12 `reference.doc` 是空字符串，`scoring.ts:285` 对空 doc 直接返回 `matched=false`。修补后单独 commit。修正 doc 后重跑 baseline：MRR 0.967 → **1.000**，hit@1 96.7% → **100%**，hit@3 同。**bge-m3 在该数据集上已经是 retrieval 天花板**。
3. ⚠️ **Task 2（建 v4 KB）部分进入但停在 6/9 doc**：新 KB id `f7910f12542711f1854b5738863ef026`，name `eval-0520-qwen3-20260520-1643`。前 6 份文档（方山新井 / 帅垛西 / 永安 / 史家堡-草舍 / 顺中三维 / 顺8井北）解析完成，剩余 3 份（张集东 / 安徽宿南 / 顺中二期）**RAGFlow CPU parser worker 卡住**：progress 长期定格在 0.3% / 0.6% / 9.3%，chunks=0，跨 25+ min 无任何增量。`setup-kb-0520.ts` 30 min 超时 cap 触发 FATAL 退出（poll loop 客户端层面，不影响 server-side）。
4. ❌ **Task 3 / 4 未跑**：因 v4 KB 还有 3 个 doc 没向量化，跑 eval 会让涉及这 3 个 doc 的题目 retrieval 失败，不公平对照，遂 abort。
5. ⚠️ **额外发现：baseline rerun 时 LLM judge 15 题 pending**（`llmJudgeReplicas: []` / `null`），是 baseline rerun 与 v4 setup 并发跑撞 RAGFlow LLM 限流所致。`results/0520-baseline-prebugfix/` 保留了"30/30 都拿到 judge 分"的旧基线（answer-final-avg 72.2%）作对照。

## Follow-ups（必做才能 resume v4 评测）

1. **RAGFlow CPU parser 卡 worker 根因排查**：ssh 上 ECS `ragflow` 主机，`docker logs docker-ragflow-cpu-1 --since 60m` 查 6/9 → 9/9 卡住期间是否有 DashScope 错误 / OOM / worker queue 死锁。判断：
   - 是否要 `docker restart docker-ragflow-cpu-1`
   - DashScope 是否需要单独配 retry / backoff
2. **setup-kb-0520.ts timeout 弹性化**：当前 30 min 写死在 line 177（`TIMEOUT_MS = 30 * 60 * 1000`），太严。改成 `--timeout-min` CLI 参数，默认 60 min；同时 poll loop 收到长时间无 progress（如 5 min 无新 DONE）时 emit warning。
3. **eval 并发污染问题**：`run.ts:syncAssistantConfig` PUT 全量替换 assistant 配置，导致两个实验不能并行跑。重构方向：让 `run.ts` 支持 `--assistant-id` override + per-experiment 临时 assistant，或者在 PUT 前 backup + 跑完 restore。
4. **LLM judge 限流稳定性**：`callLLMJudge` 串行 3 replicas，但 baseline+v4 并发时整体 90+ judge call 集中爆发。加 `p-limit` 控制 judge call 并发到 1，或者引入指数退避重试。
5. **未来如要 resume v4 实验**：
   - 删现有 KB `f7910f12542711f1854b5738863ef026`（半成品）
   - 完成上述 #1 / #2 后重跑 `pnpm eval:setup:0520-qwen3`
   - 预期 v4 vs bge-m3 大概率持平（bge-m3 已 100% retrieval，v4 无上升空间）；真正可能的差异在 similarity score 分布的鲁棒性，需要看 q*.json 里 `vectorSimilarity` 字段而非聚合分

## 历史 Follow-ups（v4 实测拿到后再考虑）

- 若 1024 维 v4 胜出明显：起 follow-up issue 跑 1536 / 2048 维
- 若切 v4 进入生产：起 issue 估算 prod-v2 KB 重建索引的 cost + 停服窗口
- 若两者基本持平：保留 bge-m3（本地化 / 可控性更高），关 issue
