# 中石化知识库项目 — 7 月周报

---

## 第 27 周（6/29 ~ 7/5）：检索回放工具 + Chunk 词典标签 + 客户交付技术说明

### 本周工作内容

1. **RAG 失败题诊断：检索回放工具**（PR #34）
   - 新增 `apps/server/scripts/eval/retrieval-replay.ts` + `retrieval-replay.lib.ts`：dump RAGFlow 每题实际召回的 top-k chunk 完整证据，把「答案错」二分成「检索错」或「LLM 总结错」
   - 单元测试覆盖：`parseIdList` / `buildReplayBody` / `mapChunk`（含 field-alias fallback）/ `truncateContent` / `isGoldDoc` / `aggregateDocs` / `renderQuestionSection` / `renderReport`
   - `--k` 参数 fail-fast 校验 + 记录 doc_aggs 自聚合行为
   - 输出诊断报告 [rag-retrieval-replay-diagnosis-2026-06.md](./rag-retrieval-replay-diagnosis-2026-06.md)：
     - 7 道失败题**全部**把 gold 文档召入 top-30，问题不是「找不到文档」而是「正确段落进没进 top-10 窗口」
     - 一半失分在检索段落级（Q14/Q18/Q24），一半在 LLM 总结（Q28/Q38/Q39）
     - 钉死两个指标陷阱：文档级 `hit@1=1` 的假阳性、文件名归一的假阴性
   - 共性根因：两套配置均未启用 rerank、`vectorSimilarityWeight=0.3` 关键词权重主导 → 排序在「同区多项目互相干扰」时力不从心

2. **Chunk 标签队列上线**（PR #35）
   - 新增 `ChunkTagQueueService` 后台轮询：文档解析 DONE 即入队 → 用「专业词典 + 项目名字典」给 chunk 打 `important_keywords`
   - 修复 `ChunkTaggerModule` 未挂入 `KnowledgeBaseModule` 导致的注入失败
   - 词典基线：`sinopec-concept-dict.csv` 2491 条术语 + `keyword-matcher.ts` 匹配 + `chunk-tagger.service.ts` 落地

3. **Chat 模型选择器**（PR #33）
   - 通用聊天页新增模型下拉，支持切换 chat 模型 + agent 选项
   - 前端 `naive-ui` 自动导入类型再生成

4. **评测配套 & 杂项**（PR #30 / PR #31）
   - `apps/server/scripts/eval/README` 补齐 + 2 份 rerank baseline 配置
   - 评测锚定脚本 lint autofix

5. **UI 修复**（PR #28）
   - 修复首次登录侧边栏菜单加载异常

6. **客户交付技术说明**
   - 新增 [sinopec-kb-parsing-and-chunking.md](./sinopec-kb-parsing-and-chunking.md)：Word/PDF 解析、表格处理、专业词典建设、分块方式四大模块的代码与文字说明，供中石化对接方查阅
   - 归档 6 月批量文档（PR #32）

### 下周工作计划

- 处理生产环境文档解析 FAIL 排查

### 备注

- 无

---

## 第 28 周（7/6 ~ 7/12）：XinferenceEmbed 8192 上限截断兜底

### 本周工作内容

1. **问题定位**
   - 生产 4 个 KB、18 篇 `_noimg.md` 文档稳定 FAIL（`run=4 / progress=-1`）
   - `progress_msg` 均指向：`xinference bge-m3` 报 `maximum context length is 8192 tokens ... your prompt contains at least 8193 input tokens`
   - 每篇 rerun 立刻复现，非偶发

2. **根因分析（两层）**
   - **表层**：docx→pandoc→md 时复杂表格被输出成整块 `<table>` 或巨型 pipe 表（最极端一条 314k 字符），`naive_merge` 遇「无 delimiter 单段」整块留作一个 chunk → 超 8192
   - **里层**：RAGFlow 用 `tiktoken cl100k_base` 数 token、xinference 上的 bge-m3 用 `XLM-RoBERTa SentencePiece`，两把尺子对同一段文本数出来不一样；bge-m3 密度 ≈ 1.001× cl100k，「刚好 8182 安全」的 chunk 服务端数出 8193 → 严格拒
   - 上游 [PR #15424](https://github.com/infiniflow/ragflow/pull/15424) 只给 `OpenAIEmbed` 等加了 `truncate_to=8191`，**漏了 `XinferenceEmbed`**，升级 RAGFlow 不能自动救

3. **兜底 patch**
   - 改 `rag/llm/embedding_model.py::XinferenceEmbed.encode`：`texts = [truncate(t, 6000) for t in texts]`
   - cap = 6000 而不是 8191：留出足够 buffer 吸收两把尺子的密度差（6000×1.3 = 7800 < 8192）
   - 通过 `docker-compose.yml` volume mount 到 `/ragflow/rag/llm/embedding_model.py`，容器 recreate / 机器重启后依然生效
   - 上游修复后可撤除，rollback 路径已记录

4. **验证与产物**
   - 表层修 delimiter 救 12/18，patch 上线后剩 6/18 全部 DONE
   - 总计 **18/18 FAIL → DONE**，包括那条 314k 的 pipe 表（1361 chunks / 137s）
   - 输出运维处理单 [ragflow-xinference-embed-truncate-patch-2026-07.md](./ragflow-xinference-embed-truncate-patch-2026-07.md)，含 patch 内容、持久化目录、副作用、撤除条件

### 下周工作计划

- 配合 xinference 侧模型统一命名，同步 RAGFlow 库配置

### 备注

- 单条 chunk 超 6000 cl100k tokens（≈ 20000 字符）时尾部会被截，向量不覆盖尾部；对巨型 pipe 表尾部通常是重复行，损失可控
- 不解决 tokenizer 尺度不一致的根本架构问题，是本地兜底

---

## 第 29 周（7/13 ~ 7/19）：sinopec 内网 RAGFlow 模型统一命名

### 本周工作内容

1. **背景**
   - sinopec 内网 Xinference 侧统一把大模型/嵌入模型 `model_uid` 命名为：
     - 大模型：`chat@xinference`
     - 嵌入模型：`embedding@xinference`
   - RAGFlow 侧数据库里的模型引用需同步改，否则请求 xinference 会 404

2. **改动范围（4 张表）**
   - `tenant_llm`：`bge-m3` → `embedding@xinference`；`qwen3.6-BnVeorTK` → `chat@xinference`
   - `tenant.embd_id` / `llm_id`：全部归一到 `embedding@xinference@Xinference` / `chat@xinference@Xinference`
   - `knowledgebase.embd_id`：9 个 KB 全部改到新嵌入
   - `dialog.llm_id`：Xinference 那批 dialog（含 `qwen3.6@Xinference` 等历史孤儿）全部改到 `chat@xinference@Xinference`；`OpenAI-API-Compatible` 的 2 个 dialog 不动
   - `Xinference` 大写保留：与 RAGFlow 内部工厂常量匹配，只改 `llm_name` 部分

3. **操作与验证**
   - 事务内一次改完，改前 `mysqldump` 备份 4 张表到 `sinopec:/root/ragflow-db-backup/rag_flow-rename-*.sql`
   - 端到端验证 3 处独立点：
     - xinference `/v1/chat/completions` + `/v1/embeddings` 直接 curl `HTTP 200`
     - RAGFlow 容器内走 tenant 配置：`XinferenceEmbed.encode()` 成功，向量维度 1024
     - `XinferenceChat.model_name='chat@xinference'`，说明 `embd_id`/`llm_id` 的 `<llm_name>@<factory>` 解析正确

### 下周工作计划

- 待定

### 备注

- 无

---

## 月度统计

| 类型         |    数量 |
| ------------ | ------: |
| `test`       |       7 |
| `docs`       |       5 |
| `fix`        |       4 |
| `chore`      |       3 |
| `feat`       |       2 |
| Merge / 其他 |       8 |
| **合计**     | **29+** |

> 说明：7 月 commit 主要集中在 7/2 ~ 7/4（若干长期分支合入 main）、7/9（截断 patch）、7/16（sinopec 内网模型改名，未落 commit）。上表统计到 7/16。

## 月度关键里程碑

- ✅ 检索回放工具落地，RAG 失败题「检索错 vs LLM 错」有可观测切点
- ✅ Chunk 词典标签队列上线，2491 条术语 + 项目名字典自动打 `important_keywords`
- ✅ 通用聊天支持切换 chat 模型 / agent
- ✅ XinferenceEmbed 8192 上限截断兜底，18/18 生产 FAIL 文档转 DONE
- ✅ 客户交付技术说明文档（解析 / 表格 / 词典 / 分块）
- ✅ sinopec 内网 RAGFlow 模型命名与 Xinference 侧对齐
