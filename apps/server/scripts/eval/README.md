# RAG 评测脚本（scripts/eval）

针对 RAGFlow 检索 + LLM 问答质量的离线评测工具。对一组标注好的问题，跑「检索 → 助手问答 → 打分」，输出每题得分与汇总，用于对比不同检索参数 / 模型 / prompt 的效果。

> 这是开发期评测工具，不参与 server 运行时。按 ESLint config-protection 约定，源码用 file-level `eslint-disable` 而非改 `eslint.config.mjs`。

## 快速开始

```bash
cd apps/server/scripts/eval

# 1. 准备环境变量（复制模板填真实值）
cp .env.eval.example .env.eval
# 编辑 .env.eval：至少填 RAGFLOW_HOST / RAGFLOW_API_KEY / DATASET_IDS

# 2. 加载环境变量并运行（dev split = 10 题小批）
set -a; source .env.eval; set +a
tsx run.ts --config configs/0520-baseline.json --dataset questions.json --split dev
```

结果写入 `results/<label>-<split>-<时间戳>.json`，终端同时打印每题进度与汇总。

## 环境变量（.env.eval）

| 变量 | 必填 | 说明 |
|---|---|---|
| `RAGFLOW_HOST` | ✅ | RAGFlow 服务地址，如 `http://10.55.247.210:9380` |
| `RAGFLOW_API_KEY` | ✅ | RAGFlow API Key（控制台生成） |
| `DATASET_IDS` | ✅ | 评测用知识库 `dataset_id`，多个逗号分隔 |
| `CHAT_ID` | 可选 | 端到端问答用的 assistant ID；**不填则只跑检索、不跑问答** |
| `JUDGE_ASSISTANT_ID` | 可选 | LLM-as-judge 打分用的 assistant ID（建议单独建、prompt 为打分指令） |
| `JUDGE_REPLICAS` | 可选 | judge 重复打分次数取均值，默认 3，范围 1–20 |
| `RAGFLOW_PROD_KEY_BLACKLIST` | 可选 | 逗号分隔的生产 key 黑名单，命中则拒绝运行（防误用生产库） |

## 命令行参数（run.ts）

| 参数 | 说明 |
|---|---|
| `--config <path>` | **必填**。实验配置 JSON（见 `configs/`） |
| `--dataset <file>` | 题集文件名（相对 `dataset/`），覆盖默认 `questions.json` |
| `--split dev\|holdout\|all` | 跑哪个子集（题集 `splits` 字段定义），默认见脚本 |
| `--resume` | 续跑（跳过已有结果） |

## 工作机制

1. **检索**：走 `POST /api/v1/retrieval`，用 `DATASET_IDS` + config 的检索参数（`top_k` / `similarity_threshold` / `vector_similarity_weight` / `rerankId` / `keyword`），算 hit / rank。
2. **问答**：走 `CHAT_ID` 指定的 assistant 的 `/api/v1/chats/{id}/completions`（先建 session）。**用的是 assistant 自带的 LLM**（`llm_id`），所以「测哪个模型」由该 assistant 在 RAGFlow 里绑的模型决定，不是 config 里的 `chat.model`。
3. **跑前自动同步 assistant**：每次实验前会 `PUT /api/v1/chats/{id}`，把 assistant 的 `dataset_ids` 重绑为 `DATASET_IDS`、并把 config 的检索参数写进去（保留原 `llm_id` / `prompt`）。
   > ⚠️ **副作用**：这会**改写 `CHAT_ID` 助手的数据集绑定与检索参数**。若借用业务助手评测，跑完记得改回（先 `GET /api/v1/chats?id=<id>` 备份原配置，跑完 PUT 还原）。
4. **打分**：
   - **规则分 `answerScore`**：基于题目的 `mustContain` / `mustNotContain` 命中情况（不需要外部 LLM）。
   - **LLM judge（可选）**：配了 `JUDGE_ASSISTANT_ID` 且题目 `useLLMJudge=true` 时，调 judge 助手打 0–1 分，重复 `JUDGE_REPLICAS` 次取均值；未配则该项为 `null`，不影响规则分。

## config 格式

`configs/*.json`：

```jsonc
{
  "label": "0520-baseline",          // 实验名，用于结果文件名
  "retrieval": {
    "similarity_threshold": 0.2,
    "vector_similarity_weight": 0.3,
    "top_k": 1024,
    "rerankId": ""                   // 留空=不 rerank
  },
  "chat": {
    "model": "qwen3max",             // 备注用；实际模型由 CHAT_ID 助手决定（见上）
    "promptVersion": "v2",
    "topN": 6                        // 注入 LLM 的 chunk 数（映射到 top_n）
  }
}
```

现有 config 速查：`A*`（检索调参网格）、`B*`（chunk/keyword 对比）、`prod-v2*`（生产配置快照）、`0520-*`（0520 重切库系列，含 promptV2/V3 与 rerank 变体）。

## 题集与知识库配对

题集在 `dataset/`，结构：`{ questions: [{id, question, reference:{doc,section}, mustContain, mustNotContain, topic, useLLMJudge}], splits:{dev:[], holdout:[]} }`。

题目的 `reference.doc` 必须真实存在于 `DATASET_IDS` 指向的知识库，否则检索必然 miss。已知配对：

| 题集 | 题数 | 内容 | 对应知识库 |
|---|---|---|---|
| `questions.json` | 20 | 顺北 21 井三维项目 | 含顺北 21 井全套报告的 dataset |
| `questions-0520.json` | 30 | 顺 8 井北 / 顺中 / 顺中二期 | 含对应 0520 报告的 dataset |

## 结果输出

`results/<label>-<split>-<时间戳>.json`，内容为 `{ config, results: QuestionResult[] }`，每题含 `answerText` / `answerScore` / `retrieval`(hit/rank) / `llmJudgeScore` / `durationMs`。终端额外打印汇总（命中率、均分等）。

## 在无 node 的服务器上跑（容器法）

部署机（如 sinopec）宿主常无 node、源码无 `node_modules`。可借用正在跑的 app 容器（自带 node）跑，**不污染宿主、不装 node**：

```bash
# 1. 把 eval 源码拷进正在运行的 app 容器
docker cp apps/server/scripts/eval/. <app容器>:/tmp/eval

# 2. 容器内装最小依赖并跑（容器需能连到 RAGFlow_HOST）
docker exec <app容器> sh -c "cd /tmp/eval \
  && npm i --no-save tsx zod dotenv \
  && cp .env.eval .env \
  && node_modules/.bin/tsx run.ts --config configs/0520-baseline.json --dataset questions.json --split dev"

# 3. 取回结果
docker cp <app容器>:/tmp/eval/results ./results-from-server
```

> `import 'dotenv/config'` 默认读 `.env`，所以容器内把 `.env.eval` 复制成 `.env`。
> 跑完清理：`docker exec <app容器> rm -rf /tmp/eval`，并删除含 key 的 `.env.eval`。

## 注意事项

- **CPU 推理慢**：CPU-only 部署下每题问答约 10–60s（取决于模型与 token 数），dev 10 题数分钟级，属正常。
- **Node 输出块缓冲**：stdout 重定向到文件时是块缓冲，跑程中 `tail` 可能暂时看不到，待 flush 或进程结束后可见；进度以「进程是否存活 + 结果文件」为准。
- **`chat.model` 仅为备注**：真实模型 = `CHAT_ID` 助手所绑模型。要换被测模型，改 RAGFlow 里该助手的 LLM，或换一个绑目标模型的 `CHAT_ID`。
- **prod key 保护**：`RAGFLOW_PROD_KEY_BLACKLIST` 命中即拒跑，避免对生产库误评。
</parameter>
</invoke>
