# RAGFlow 端到端数据流转流程图 — 制作计划

> **说明（偏离标准模板）：** writing-plans 的标准模板面向「写代码 + TDD 测试循环」。本任务的交付物是**一张准确的可视化流程图**（drawio），不产出可执行代码，因此把模板的「写失败测试 → 实现 → 跑测试」替换为对图表真正有效的验收手段：**① 源码逐项核对（每个步骤必须在 RAGFlow 源码里找到对应）② drawio XML 结构校验（良构 + 连线 source/target 完整）③ 与现有 `rag-system-design.md` §6 数据流文字版比对**。其余精神（明确范围、bite-sized 步骤、精确锚点、自检）保留。

**Goal:** 产出一张工程级、逐步的 RAGFlow 端到端数据流转流程图（drawio，双 tab：摄入·落库流 + 问答·检索流），每个步骤标注源码锚点，且全部经源码核对一致、可作为客户答疑 / 论文素材交付。

**Architecture:** 4 层横向泳道（表现层 Vue / 业务编排层 NestJS / RAG 内核 Python / 数据层），时间从左到右推进；两条主线拆成两个 diagram tab；可选 / 条件分支（RAPTOR、GraphRAG、Rerank、空结果回退、上下文扩展、引用兜底）一律用虚线节点+虚线连线区分于主干。

**Tech Stack:** drawio（mxGraph XML，手写）；源码核对基于仓库内软链 `ragflow-src/` → `/root/code/ragflow`；XML 校验用 `python3 -c xml.etree`。

**现状:** 初稿已存在 `docs/ragflow-pipeline-detailed.drawio`（两个 tab，43+ 节点）。本计划用于**核对初稿准确性并定稿**，而非从零重画。

---

## 范围（必须先对齐）

**In scope（画什么）：**
- 数据从「用户上传文件」到「落库」的完整处理链（解析 / 切分 / 嵌入 / 落库 / 可选增强）。
- 数据从「用户提问」到「答案+引用返回」的完整检索链（混合检索 / 重排 / 子→父扩展 / 组装 / 生成 / 回填）。
- 每步落在哪一层、对数据做什么、产出/落库什么、源码在哪。

**Out of scope（不画）：**
- 前端 UI 组件细节、路由、状态管理。
- 部署拓扑 / 容器 / 网络（那是 `architecture.drawio` 的职责）。
- Prisma 业务域数据模型（与 RAG 数据流无关）。

## 分层与视觉约定（锁定后不再变）

| 泳道 | 颜色 | 归属 |
|---|---|---|
| 表现层 · Vue | 蓝 `#dae8fc` | 上传组件 / EventSource / 渲染 |
| 业务编排层 · NestJS | 紫 `#e1d5e7` | uploadDocument / chatStream / SSE 透传 |
| RAG 内核 · Python | 绿 `#d5e8d4` | task_executor / async_chat / Dealer.search |
| 数据层 | 黄 `#fff2cc` | MinIO / Redis / ES·Infinity / MySQL / 模型 |

- **主干**：实线节点 + 实线箭头。
- **可选/条件**：虚线节点（`dashed=1`）+ 虚线箭头（RAPTOR=橙、GraphRAG=灰、其余=绿/灰虚线）。
- 节点文字格式：`序号 + 动作 + 关键数据形态 + 源码文件:行`。

## 文件结构

- 主交付：`docs/ragflow-pipeline-detailed.drawio`（修订定稿）
- 配套（可选）：`docs/ragflow-rag-qa-notes.md` 末尾加「配套流程图」引用；如需静态图再导出 PNG。
- 计划本身：`docs/superpowers/plans/2026-06-03-ragflow-dataflow-diagram.md`（本文件）

---

## Task 1：核对「摄入·落库流」步骤清单与源码锚点

**目的：** 在画/改图前，逐项确认下表每一步在源码里真实存在、顺序正确、可选性标注正确。这是用户 review 的核心——可在此增删步骤、调整粒度。

| # | 层 | 动作 | 输入 → 产出 | 源码锚点 | 可选 |
|---|---|---|---|---|---|
| ① | FE | 用户上传文件 | 文件 → `POST /api/knowledge-base/documents` | Vue 上传组件 | 否 |
| ② | BE | `uploadDocuments()` | multipart → 转发准备 | `knowledge-base.service.ts:496` | 否 |
| ③ | BE | `.docx` pandoc 预规范化 | docx → 规范化 docx | `DocxPreprocessService` | 仅 docx |
| ④ | BE | 转发 multipart + 持久化 parser_config | → `POST /datasets/{id}/documents` | `knowledge-base.service.ts` | 否 |
| ⑤ | DATA | 原始文件落 MinIO | 文件 → MinIO(RAG 域) | FileService | 否 |
| ⑥ | BE | `POST /datasets/{id}/chunks` 触发解析 | → 入队 | — | 否 |
| ⑦ | RAG | task_executor 取任务 | Redis 队列 → 任务 | `rag/svr/task_executor.py` | 否 |
| ⑧ | RAG | DeepDOC 解析 | 文件 → 带坐标 boxes | `deepdoc/parser/pdf_parser.py:55` | 否 |
| ⑨ | RAG | Chunker 切分（chunk_method） | boxes → 叶子块(+mom_id) | `rag/nlp/__init__.py` naive_merge:1070 / hierarchical_merge | 否 |
| ⑩ | RAG | Embedding | 叶子块 → `q_{dim}_vec` | — | 否 |
| ⑪ | DATA | 写入 ES/Infinity + 回写 MySQL | → 索引 | — | 否 |
| ⑫ | RAG | RAPTOR（读叶子向量→聚类→摘要→嵌入→写回） | 叶子向量 → 摘要节点入同库 | `task_executor.py:766` / `rag/raptor.py:112` | 可选 |
| ⑬ | RAG | GraphRAG（实体/关系/community） | chunk → 图模型 | `graphrag/` | 可选·默认关 |
| ⑭ | FE | 轮询 `document.run=DONE` | → 前端状态刷新 | — | 否 |

- [ ] **Step 1.1** 对 ②④ 用 `grep -n "uploadDocument" ragflow-src/../apps/server/src/modules/knowledge-base/knowledge-base.service.ts`（注：BE 在本仓 `apps/server`，非 ragflow-src）确认函数与行号。
- [ ] **Step 1.2** 对 ⑦⑧⑨⑩⑪⑫⑬ 在 `ragflow-src/` 下逐一 `grep` 确认存在与顺序（task_executor 主流程）。
- [ ] **Step 1.3** 与 `docs/rag-system-design.md` §6.1 文档摄入流文字版逐行比对，标记任何不一致。
- [ ] **Step 1.4** 产出「确认/修订后的步骤清单」（更新本表）。

**验收：** 表中每一步都有可点击源码锚点；§6.1 中出现但表中缺失的步骤为 0（或已记录为「有意省略」）。

---

## Task 2：核对「问答·检索流」步骤清单与源码锚点

| # | 层 | 动作 | 输入 → 产出 | 源码锚点 | 可选 |
|---|---|---|---|---|---|
| ① | FE | 用户提问 | → EventSource SSE | — | 否 |
| ② | BE | `completions()` requestStream→res.pipe(res) | → `POST /chats/{id}/completions` | `assistant.service.ts:100` | 否 |
| ③ | RAG | `async_chat()` 装配上下文 | 历史+配置+模型 | `dialog_service.py:275` | 否 |
| ④ | RAG | `FulltextQueryer.question` min_match=0.3 | qst → BM25 多字段 query | `rag/nlp/query.py:41` | 否 |
| ⑤ | RAG | `get_vector` ANN(cosine) | qst → `q_{dim}_vec` 查询 | `rag/nlp/search.py:52` | 否 |
| ⑥ | RAG | `Dealer.search` FusionExpr 0.05/0.95 topK=1024 | → topK 候选 | `search.py:114-128` | 否 |
| ⑦ | RAG | 空结果回退 0.3→0.1 / 0.1→0.17 | → 重试 | `search.py:136-147` | 条件 |
| ⑧ | RAG | Rerank（Jina cross-encoder）→ topN=6 | topK → topN | `rag/llm/rerank_model.py:56` | 可选 |
| ⑨ | RAG | `retrieval_by_children` 子→父 | 命中叶子 → 父块原文 | `search.py:658` / `dialog_service.py:436` | 默认开 |
| ⑩ | RAG | toc_enhance / use_kg / Tavily | → 上下文扩展 | `dialog_service.py:432-441` | 可选 |
| ⑪ | RAG | `kb_prompt()` 注入 `{knowledge}` | chunks → 带[ID:n]文本 | `dialog_service.py:448` | 否 |
| ⑫ | RAG | `citation_prompt()` 引用约束 | → prompt | `dialog_service.py:462` | 条件 |
| ⑬ | RAG | LLM 流式 + `<think>` 剥离 | prompt → answer 流 | `dialog_service.py:199/477` | 否 |
| ⑭ | RAG | `insert_citations()` 句级兜底 | answer → 带引用 | `search.py:177` | 条件 |
| ⑮ | BE | SSE 帧原样透传 | → 前端 | `assistant.service.ts` | 否 |
| ⑯ | FE | 渲染答案+引用 chip+坐标跳转 | → UI | — | 否 |

- [ ] **Step 2.1** 在 `ragflow-src/` 下逐一 grep ③–⑭ 的源码锚点，确认行号现行有效（记忆可能过期，必须现查）。
- [ ] **Step 2.2** 确认 ④⑤ 是**并行两路**汇入 ⑥（图上应画分叉再汇合），而非串行。
- [ ] **Step 2.3** 与 `rag-system-design.md` §6.2 问答流文字版比对。
- [ ] **Step 2.4** 产出确认/修订后的步骤清单。

**验收：** 同 Task 1；额外确认 ⑦⑧⑨⑩⑫⑭ 的「可选/条件」标注与源码 if 判断一致。

---

## Task 3：绘制/修订「摄入·落库流」tab

**Files:** Modify `docs/ragflow-pipeline-detailed.drawio`（diagram id=`ingest-flow`）

- [ ] **Step 3.1** 依 Task 1 定稿清单，核对初稿 14 个节点的文字/锚点/泳道归属，修正偏差。
- [ ] **Step 3.2** 确认可选节点（⑫RAPTOR 橙虚线、⑬GraphRAG 灰虚线）样式正确，主干为实线。
- [ ] **Step 3.3** 确认跨泳道连线方向正确（④→⑤落库下行、⑥→Redis→⑦取任务、⑩→⑪落库、⑫读取/写回同库双向）。

**验收：** 见 Task 5 统一校验。

## Task 4：绘制/修订「问答·检索流」tab

**Files:** Modify `docs/ragflow-pipeline-detailed.drawio`（diagram id=`qa-flow`）

- [ ] **Step 4.1** 依 Task 2 定稿清单核对初稿 16 节点。
- [ ] **Step 4.2** 确认 ④BM25 / ⑤向量 画成分叉两路汇入 ⑥（Step 2.2 结论）。
- [ ] **Step 4.3** 确认 ⑥↔ES、⑬↔LLM 为数据层双向交互；⑦回退、⑧Rerank、⑩扩展、⑭兜底为虚线。

## Task 5：整体校验（替代「跑测试」）

- [ ] **Step 5.1 XML 良构** — 用 `defusedxml`（避免 stdlib `xml.etree` 的 XXE/billion-laughs 默认不设防；本地可信文件也按安全默认写）。Run: `python3 -c "import defusedxml.ElementTree as ET; [print(d.get('name'), sum(1 for _ in d.iter('mxCell'))) for d in ET.parse('docs/ragflow-pipeline-detailed.drawio').iter('diagram')]"` — Expected: 两个 diagram 均成功解析、节点数 >0。（环境已装 defusedxml 0.7.1；缺失时 `pip install defusedxml`。）
- [ ] **Step 5.2 连线完整性** — 脚本检查每条 `edge` 的 `source`/`target` 都指向已存在的节点 id（无悬空箭头）。Expected: 悬空连线 = 0。
- [ ] **Step 5.3 锚点一致性** — 抽查 5 个节点的源码锚点，确认 `ragflow-src/<path>:<line>` 当前可定位到对应函数。
- [ ] **Step 5.4 文档一致性** — 与 §6 文字版数据流无矛盾。

**验收：** 5.1–5.4 全通过；用户在 VSCode Draw.io 插件能正常打开两个 tab。

## Task 6（可选）：配套

- [ ] **Step 6.1** `ragflow-rag-qa-notes.md` 末尾加「配套逐步流程图：ragflow-pipeline-detailed.drawio」引用。
- [ ] **Step 6.2** 如需静态展示，导出 PNG（需安装 drawio CLI，当前环境无 → 待定）。

---

## 开放决策点（需你拍板，影响 Task 3/4/6）

1. **粒度**：当前到「函数级步骤」（⑧DeepDOC、⑨Chunker…）。要更细（拆到 OCR/Layout/TSR 三模型、naive/hier/table 三切片函数分叉）还是更粗（合并成 5-6 个大步骤）？
2. **形态**：保持双 tab 分流，还是合并成一张大图？
3. **可选分支**：RAPTOR/GraphRAG/Rerank/回退 是否都要画进主图，还是只画主干、可选项放图例说明？
4. **静态导出**：是否需要 PNG/SVG（需我装 drawio CLI），还是 `.drawio` 可编辑文件即可？

## Self-Review

- **范围覆盖**：摄入流 §6.1 全部步骤 → Task 1 表；问答流 §6.2 → Task 2 表。✅
- **占位符扫描**：无 TBD/TODO；步骤锚点均具体到文件:行（行号标注「需现查确认」因记忆可能过期）。✅
- **一致性**：两表的层/颜色与「分层约定」表一致；节点编号与初稿一致。✅
- **已知风险**：记忆中的行号可能与当前源码漂移 → Task 1.2 / 2.1 / 5.3 强制现查。
