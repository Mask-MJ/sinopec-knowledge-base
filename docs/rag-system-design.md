# 中石化知识库 RAG 系统（自研一体化方案）

> 本文档面向论文 / 技术报告写作，按"一体化系统"视角整合表现层（Vue）、业务编排层（NestJS）、RAG 内核（自研 Python 引擎）三层，从文档解析、向量切片、混合召回、上下文扩展、生成与引用五个维度展开，附端到端数据流与系统设计亮点。所有源码引用均带文件路径与行号，可直接作为论文素材引用。
>
> 配套架构图：[architecture.drawio](architecture.drawio)（业务系统架构图 / RAG 技术流程图，两页 tab）。

---

## 0. 系统总览

本系统由四个分层模块构成，从下到上：

| 分层 | 实现 | 主要职责 |
|---|---|---|
| **表现层** | Vue 3 + Naive UI + UnoCSS + Pinia + openapi-fetch | 浏览器端交互、SSE 流式渲染、引用气泡 |
| **业务编排层** | NestJS（TypeScript / SWC / Prisma） | 鉴权、会话管理、文件流转、参数持久化、SSE 透传 |
| **RAG 内核** | Python 引擎（DeepDOC + chunker + hybrid retriever + citation） | 解析、切片、向量化、混合召回、生成 |
| **数据层** | PostgreSQL 17 / MySQL / Elasticsearch（或 Infinity）/ Redis / MinIO | 业务元数据、RAG 元数据、向量+全文索引、队列缓存、对象存储 |

表现层、业务编排层、RAG 内核分别对应 `apps/client/`、`apps/server/`、`/root/code/ragflow/`。三者都是本项目自研代码——RAG 内核以 Python 实现，业务编排层以 NestJS 实现，分层的根本动因不是技术选型割裂，而是 **"高吞吐 IO 编排 vs 高密度 ML 计算"** 的工作负载分离：NestJS 善于做 SSE 透传、文件 multipart、权限校验、Prisma 关联查询；Python 内核善于做 ONNX 推理、向量数学、LLM 异步流。两层间通过本地内网 HTTP + SSE 通信，Bearer Token 鉴权。

**业务域 / RAG 域的存储分离**也是有意为之：

- **业务域**（PG + Redis + MinIO）：用户、角色、菜单、知识库元配置、助手配置、操作日志、业务上传文件。受 Prisma 模型与迁移系统严格管控（[apps/server/prisma/models/](apps/server/prisma/models/)）。
- **RAG 域**（MySQL + ES/Infinity + Redis + MinIO）：dataset / document / chunk / 向量、解析任务队列、原始文件与切片图像。受 RAG 内核生命周期管控。

二者通过 `KnowledgeBase.datasetId / Assistant.assistantId` 弱关联（[knowledgeBase.prisma](../apps/server/prisma/models/knowledgeBase.prisma) / [assistant.prisma](../apps/server/prisma/models/assistant.prisma)）。这样的好处：业务域可以随业务版本节奏迭代（菜单、字典、组织架构变化），RAG 域可以随检索算法节奏迭代（chunk_method 扩展、新增 embedding、切换存储后端），互不阻塞。

---

## 1. 文档解析层：自研 DeepDOC 视觉解析栈

### 1.1 解析触发与流转

文档进入系统的路径：

```
Vue 上传组件 → POST /api/knowledge-base/documents
            → KnowledgeBaseService.uploadDocument()                 [apps/server/.../knowledge-base.service.ts:518]
            → (.docx) DocxPreprocessService (pandoc 规范化)          [knowledge-base.service.ts:506]
            → 转发 RAG 内核 POST /api/v1/datasets/{id}/documents (multipart)
            → 原始文件落 MinIO（RAG 域）
            → 调用 POST /api/v1/datasets/{id}/chunks {document_ids:[...]}
            → task_executor 入 Redis 队列
            → 异步解析 + 切片 + 向量化 + 入 ES
            → document.run = DONE
```

业务编排层做两件事：① `.docx` 的 pandoc 预规范化（去除复杂域代码、修复历史 WPS / Office 模板带来的样式残留，确保下游 heading 识别可靠），② 把解析参数（`parser_config`）持久化到 PG 的 `KnowledgeBase.parserConfig` 字段（[knowledgeBase.prisma](../apps/server/prisma/models/knowledgeBase.prisma)），便于后续重解析或参数演进。

中石化场景下系统默认的 `parser_config` 见 [apps/server/src/common/defaults/knowledge-base.defaults.ts](../apps/server/src/common/defaults/knowledge-base.defaults.ts)：

```js
{ layout_recognize: 'DeepDOC', chunk_token_num: 512, delimiter: '\n',
  raptor:   { use_raptor: false, max_token: 256, threshold: 0.1, max_cluster: 64, random_seed: 0 },
  graphrag: { use_graphrag: false, entity_types: ['organization','person','geo','event','category'], method: 'light' } }
```

`chunk_token_num=512`（比内核函数默认值 128 大 4 倍）是针对中石化文档"长技术规范、多专有名词、表述完整度高"的特征做的系统级调优——更长 chunk 减少跨块语义断裂，与下游 `topN=6` 配合后单次 LLM context 在 ~3K token 内可控。

### 1.2 DeepDOC：三模型视觉栈

DeepDOC 是本系统自研的 PDF 视觉解析栈，位于 [deepdoc/parser/pdf_parser.py:55](file:///root/code/ragflow/deepdoc/parser/pdf_parser.py)：

```python
class RAGFlowPdfParser:
    def __init__(self):
        self.ocr      = OCR()                          # 文字识别
        self.layouter = LayoutRecognizer(domain)       # 版面分类
        self.tbl_det  = TableStructureRecognizer()     # 表格结构识别
```

三个 ONNX 模型（权重在 `rag/res/deepdoc/`）的分工：

- **OCR**：扫描 PDF / 图片 PDF 的文字提取，支持中英文混排。
- **LayoutRecognizer**：版面分类（title / text / table / figure / header / footer / list / equation / reference），告诉切片层"这个 box 是什么"。
- **TableStructureRecognizer (TSR)**：表格单元格结构识别，区分合并单元格、识别表头层次，输出可还原的 HTML 表格。

每个文本块输出不是裸字符串，而是带几何坐标 + 版面语义的结构体（[pdf_parser.py:518-519, 655-656](file:///root/code/ragflow/deepdoc/parser/pdf_parser.py)）：

```python
{ "page_number": ..., "layout_type": "title|text|table|figure|...",
  "top": ..., "bottom": ..., "x0": ..., "x1": ..., "text": "..." }
```

这个设计的工程后果非常深远：**几何坐标和版面类型从解析层一路携带到检索结果，最终被前端用于"点击引用跳转到原文具体页面/位置"**（§4.4）。这是本系统与"裸文本 RAG"最大的差异。

DOCX / PPT / Excel / Markdown / HTML 各自有专属 parser（`deepdoc/parser/*_parser.py`），其中 `RAGFlowDocxParser`（[docx_parser.py:25](file:///root/code/ragflow/deepdoc/parser/docx_parser.py)）通过 `__extract_table_content / __compose_table_content` 保留合并单元格，输出 HTML 表格交给下游 `tokenize_table`。

### 1.3 章节结构保留

DeepDOC 本身不直接做章节合并；章节层级的恢复发生在切片层的 `hierarchical_merge`（[rag/nlp/__init__.py:~980](file:///root/code/ragflow/rag/nlp/__init__.py)）。该函数用 `BULLET_PATTERN`（一组覆盖 `1./1.1/(1)/一、…/Ⅰ、…/Chapter X` 等中英文章节模板的正则）识别层级，把段落归属到对应章节节点，输出树形结构，再压平成带 `mom_id` 父子标记的 chunk 序列。

"解析–切片解耦"的好处：即使 DOCX 没有规范使用 heading style（这在中石化历史文档里很常见），切片层也能基于章节编号正则抢救层级。中石化内部规范文件、操作手册大多有严格章节号，因此 `chunk_method=naive` + `layout_recognize=DeepDOC` 已能覆盖绝大部分文档。

### 1.4 是否直接产出 markdown

**不直接产出。** 内核的解析中间表示是带几何坐标的结构化对象列表，markdown / HTML 只在表格特殊处理（`tokenize_table`）时作为序列化形式同时入库。这样设计的原因是：markdown 是有损序列化（丢坐标、丢版面类型），如果用 markdown 当中间表示，前端就无法做"高亮原文坐标"，而且检索阶段无法按 `layout_type` 过滤。

---

## 2. 向量切片层

### 2.1 十种 chunk_method 的领域语义

本系统把"文档类型 + 切片策略"打包为 10 种 `chunk_method`，每种对应 `rag/app/*.py` 中的一个模块：

| chunk_method | 适用文档 | 核心策略 |
|---|---|---|
| `naive` | 通用 | token + 分隔符切，最快 |
| `paper` | 论文 | 按 Abstract / Methods / References 等结构段切 |
| `book` | 书籍 | 章节层级优先，与 RAPTOR 协同 |
| `table` | 纯表格（xlsx/csv） | 每行作为独立 chunk，带表头 |
| `qa` | FAQ | 一问一答配对入库（`question_kwd` 字段） |
| `manual` | 手册 | 类似 book，重保留小节编号 |
| `laws` | 法律法规 | 按条款切分 |
| `picture` | 图片 | OCR + Image-to-Text |
| `presentation` | PPT | 每页作 chunk + 缩略图 |
| `one` | 短文档 | 不切，整文档作单 chunk |

业务编排层把选择持久化在 `KnowledgeBase.chunkMethod`，默认 `naive`。系统支持**单文档级 override**：`PUT /datasets/{id}/documents/{docId}` 改 `chunk_method` 与 `parser_config`（[knowledge-base.service.ts:484-493](../apps/server/src/modules/knowledge-base/knowledge-base.service.ts#L484-L493)），适合"同一知识库内 PDF 用 naive、Excel 用 table、FAQ 用 qa"的混合场景。

### 2.2 三个核心切片函数

**`naive_merge`**（[rag/nlp/__init__.py:1070](file:///root/code/ragflow/rag/nlp/__init__.py)）是 90% 文档走的路径：

```python
def naive_merge(sections, chunk_token_num=128, delimiter="\n。；！？", overlapped_percent=0):
    ...
    if cks[-1] == "" or tk_nums[-1] > chunk_token_num * (100 - overlapped_percent) / 100.:
        if cks:
            overlapped = RAGFlowPdfParser.remove_tag(cks[-1])
            t = overlapped[int(len(overlapped) * (100 - overlapped_percent) / 100.):] + t
        cks.append(t); tk_nums.append(tnum)
```

要点：① 按 `delimiter`（中文标点优先）句切，② 累加至 `chunk_token_num` 上限切块，③ `overlapped_percent` 实现**滑窗重叠**，避免跨块语义断裂，④ 支持反引号包裹的**自定义分隔符**（L1103-1121），如 ``delimiter='\n。`---`'`` 在出现 `---` 时强制断块——适配带固定分割符的工程文档。

**`hierarchical_merge`** 处理带章节层级的文档（§1.3），输出父子结构。

**`tokenize_table`**（[rag/nlp/__init__.py:~375](file:///root/code/ragflow/rag/nlp/__init__.py)）是表格独立路径：输入 `(img, rows)` 对，输出 chunk 标记 `doc_type_kwd:"table"`，**HTML 形式存 `content_with_weight`、markdown 形式存 `content_ltks`**，截图独立存 MinIO 并写 `img_id`。检索命中后前端可双形式渲染：HTML 给人看（保留表格视觉），markdown 给 LLM 看（节省 token）。

### 2.3 父子映射 `mom_id`：本系统的关键工程设计

`mom_id` 是写入 ES / Infinity 的一等公民字段（[search.py:95](file:///root/code/ragflow/rag/nlp/search.py) 默认 src 字段列表显式包含）。设计意图：

- **子块**：粒度细（128~512 token），保证向量召回精度；
- **父块**：粒度粗（章节/段落级），保证给 LLM 的上下文连贯；
- **关联**：子块在写入时持有 `mom_id`，检索命中子块后由 `retrieval_by_children` 一次反查父块（§4.1）。

与社区方案对比：LlamaIndex 的 `ParentDocumentRetriever` 需要在客户端做两次 query，本系统在 ES DSL 中通过 `terms` 过滤一次完成，少一次网络 RTT。

### 2.4 RAPTOR 多层抽象

RAPTOR 实现在 [rag/raptor.py](file:///root/code/ragflow/rag/raptor.py) 的 `RecursiveAbstractiveProcessing4TreeOrganizedRetrieval`：

```python
def _get_optimal_clusters(self, embeddings, ...):
    # 用 BIC 选最优 GaussianMixture 聚类数
async def summarize(self, cluster_chunks):
    # 异步调 LLM 出每簇摘要 → 摘要再 embed → 进入下一层
```

构建流程：原子 chunks → GaussianMixture 软聚类 → 每簇 LLM 摘要 → 摘要 embed → 形成上一层；递归直到簇数收敛或达 `max_cluster`。**所有层向量入同一索引**，靠字段标记区分层级。检索时"摘要命中 → 下钻到原子块"是天然的层级展开。

中石化场景下系统通过环境变量 `KB_DEFAULT_RAPTOR=1` 全局开启，并把 RAPTOR 摘要的 prompt 也放在 `parser_config.raptor.prompt` 里——适合"年度规划 / 季度月报"类长文档。

### 2.5 GraphRAG 知识图谱增强

[graphrag/](file:///root/code/ragflow/graphrag/) 实现微软 GraphRAG 的 light 模式（即 LightRAG），流程：

1. **实体抽取**：LLM 从 chunk 抽 entity + relation，写字段 `entity_kwd / from_entity_kwd / to_entity_kwd`；
2. **社区检测**：Leiden 算法分簇；
3. **社区报告**：LLM 为每簇生成摘要，落 `knowledge_graph_kwd:"community_report"`；
4. **检索期**：`_community_retrieval_()`（[graphrag/search.py:293-315](file:///root/code/ragflow/graphrag/search.py)）按 `knowledge_graph_kwd:"community_report"` 过滤拉取。

中石化场景默认 `entity_types=['organization','person','geo','event','category']`——刻意保留 `organization` 与 `event`（部门、项目、事件），适合"X 项目由哪个部门负责" / "Y 事件涉及哪些标准"这类关系型查询。

---

## 3. 混合召回机制

### 3.1 入口编排：一条 SSE 通道贯通三层

业务编排层入口 [apps/server/src/modules/assistant/assistant.service.ts:112-161](../apps/server/src/modules/assistant/assistant.service.ts#L112-L161)：

```ts
async chatStream(assistantId, dto, res): Promise<void> {
  const upstream = await this.ragflow.requestStream('POST',
    `/api/v1/chats/${assistantId}/completions`,
    { question: dto.question, stream: true, session_id: dto.sessionId, user_id: dto.userId });
  upstream.pipe(res);                        // 直接透传 Buffer
}
```

业务编排层在问答路径上**不解码、不缓存、不拼接** SSE 帧，纯 Buffer 透传给 Express Response。这是一个明确的设计选择：首 token 延迟由 RAG 内核 + 网络 RTT 决定，业务层不引入额外 buffering——对长文本流式问答这是关键。

RAG 内核入口 [api/db/services/dialog_service.py:275 `async_chat()`](file:///root/code/ragflow/api/db/services/dialog_service.py)，把会话历史、助手配置、知识库列表、嵌入模型、Rerank 模型一并装配，调用 `Dealer.search`。

### 3.2 双路检索的源码本相

核心是 [`Dealer.search()`](file:///root/code/ragflow/rag/nlp/search.py)（L74-171）。关键三行（L114-128）：

```python
matchText, keywords = self.qryr.question(qst, min_match=0.3)                     # ① BM25
matchDense          = await self.get_vector(qst, emb_mdl, topk,
                                            req.get("similarity", 0.1))          # ② ANN
fusionExpr          = FusionExpr("weighted_sum", topk, {"weights": "0.05,0.95"}) # ③ 融合
matchExprs          = [matchText, matchDense, fusionExpr]
res                 = await thread_pool_exec(self.dataStore.search, ...,
                                             matchExprs, ...)
```

**FusionExpr** 是本系统跨存储引擎抽象的融合算子，`weighted_sum` 在 ES 后端会编译成 `script_score` + `rank_features` 的混合打分，在 Infinity 后端是原生 `FUSION` 子句。**默认权重 `0.05 BM25 + 0.95 vector`** 偏向语义——这在中文场景是合理的（BM25 对中文分词敏感，且企业文档同义改写多）。该权重通过 `Assistant.keywordsSimilarityWeight` 字段持久化（[assistant.prisma](../apps/server/prisma/models/assistant.prisma) 默认 `0.7`），可在前端按助手粒度调整。

### 3.3 BM25 字段加权

[`FulltextQueryer.question()`](file:///root/code/ragflow/rag/nlp/query.py)（L41-86）把自然语言展开成多字段加权布尔查询：

| 字段 | 权重 | 含义 |
|---|---|---|
| `important_kwd` | ^30 | 重要关键词（人工/LLM 标注） |
| `title_tks` | ^10 | 文档/段落标题分词 |
| `content_ltks` | ^1 | 主体粗粒度分词 |
| `content_sm_ltks` | ^0.x | 细粒度分词（兜底召回） |
| `question_tks` | – | qa chunker 特有的问句字段 |

`important_kwd^30` 极高的权重意味着：如果在切片或后处理阶段给 chunk 打上准确的关键词标签（行业术语、设备编号、规范号），召回质量会显著上升。这是系统后续值得加强的方向——在 `chunkMethod=manual` 类的入库流程里加规则抽取或 LLM 标注 `important_kwd`。

### 3.4 向量列动态命名 `q_{dim}_vec`

[search.py:59](file:///root/code/ragflow/rag/nlp/search.py)：

```python
vector_column_name = f"q_{len(embedding_data)}_vec"
```

向量列名包含维度，意味着**同一索引下可以共存多种 embedding 模型**（如 `bge-m3` 1024 维 + `bge-small` 512 维）。切换或新增 embedding 时不需要重建索引——写入与查询都按维度自动选列。这对系统长期演进意义重大：embedding 模型迭代时无需做全库重建。

### 3.5 空结果自动回退（健壮性细节）

[search.py:136-147](file:///root/code/ragflow/rag/nlp/search.py)：

```python
if total == 0:
    if filters.get("doc_id"):                              # 指定文档时直接放宽
        res = ... search(..., [], ...)                     # 取消所有 match
    else:
        matchText, _ = self.qryr.question(qst, min_match=0.1)        # BM25 阈值 0.3 → 0.1
        matchDense.extra_options["similarity"] = 0.17                # vec sim 0.1 → 0.17
        res = ... search(..., [matchText, matchDense, fusionExpr], ...)
```

首次按高阈值（精确）召回；为空时**降 BM25 最小匹配率 + 反向升向量相似度阈值**重试。后者乍看反直觉，实际是因为：放宽 BM25 会引入大量低分文本噪声，反而需要向量相似度作为"语义闸门"过滤回噪声。"双阈值反向调节"是本系统区别于裸 RAG 实现的生产级健壮性体现。

### 3.6 Rerank 精排

[rag/llm/rerank_model.py:56-74](file:///root/code/ragflow/rag/llm/rerank_model.py) 的 `JinaRerank` 在 `search.py:404-412 rerank_by_model` 中被调用。Rerank 是可选的两阶段检索：FusionExpr 出 top-K（默认 1024）→ cross-encoder 重排出 top-N（默认 6）。两个 top 的含义在系统中明确区分：

- `topK=1024` → **召回宽度**（recall 上限），影响 ES/Infinity 检索代价；
- `topN=6` → **送入 LLM 的块数**（precision + context budget），影响生成代价。

业务编排层把这两个参数持久化在 [assistant.prisma](../apps/server/prisma/models/assistant.prisma)（`topK Int @default(1024) / topN Int @default(6)`），前端按助手调整。

### 3.7 存储引擎可插拔

`common/doc_store/` 下 `es_conn_base.py / infinity_conn_base.py / opensearch_conn_base.py / oceanbase_conn_base.py` 实现同一 `DocStoreConnection` 接口。切换由 `DOC_ENGINE` 环境变量控制：

- **ES**：成熟、运维存量丰富，生产首选；
- **Infinity**：自研，原生支持 `FUSION` 融合算子与混合检索，性能上限更高；
- **OpenSearch / OceanBase**：云厂商兼容场景。

业务编排层完全无感——只持久化 `embeddingModel` 与 `chunkMethod` 等业务参数，不感知存储引擎。

---

## 4. 召回后上下文扩展

### 4.1 子→父扩展（默认开启）

`async_chat` 检索阶段明确触发（[dialog_service.py:436](file:///root/code/ragflow/api/db/services/dialog_service.py)）：

```python
kbinfos["chunks"] = retriever.retrieval_by_children(kbinfos["chunks"], tenant_ids)
```

`retrieval_by_children`（[search.py:658-704](file:///root/code/ragflow/rag/nlp/search.py)）做三件事：① 收集所有命中子块的 `mom_id`，② 一次 ES `get` 拉取所有父块原文，③ 把同一父块下的多个子块合并为单条记录，拼接 `content_ltks`、合并 `positions`：

```python
chunk = self.dataStore.get(id, idx_nms[0], [ck["kb_id"] for ck in cks])
d["content_ltks"] = " ".join([ck["content_ltks"] for ck in cks])
d["positions"]    = chunk.get("position_int", [])
```

效果：**召回粒度细 → 给 LLM 的上下文粗**，既保住向量精度又避免上下文碎片化。

### 4.2 TOC 增强（按需开启）

[dialog_service.py:432-435](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
if prompt_config.get("toc_enhance"):
    cks = await retriever.retrieval_by_toc(" ".join(questions),
                                           kbinfos["chunks"], tenant_ids, chat_mdl, dialog.top_n)
    if cks: kbinfos["chunks"] = cks
```

让小模型根据问题挑"应该看哪些章节"，再按章节定向取块。适合手册/规范类长文档——可在助手的 `prompt_config` 中按需开启。

### 4.3 GraphRAG community 扩展

当 `prompt_config.use_kg=true`（L442-446）：

```python
ck = await settings.kg_retriever.retrieval(...)
if ck["content_with_weight"]:
    kbinfos["chunks"].insert(0, ck)                # community report 插到块列表头部
```

把社区报告作为"全局视角"块放到最前，配合细粒度块——典型的 "global → local" 上下文组装。

### 4.4 位置 / 高亮回填

`Dealer.search` 返回的 `SearchResult` 字段包含 `highlight` 与每块的 `position_int`（[search.py:161-170](file:///root/code/ragflow/rag/nlp/search.py)）。`position_int` 在 PDF 是 `(page, x0, y0, x1, y1)`，让前端可以**点击答案的引用跳转到原文 PDF 的具体坐标**——这是本系统视觉解析栈带来的端到端体验闭环。

### 4.5 Tavily 联网检索（受控）

[dialog_service.py:437-441](file:///root/code/ragflow/api/db/services/dialog_service.py) 支持把 Tavily Web 结果合并进 `chunks`，适合"内部知识 + 外部资讯"场景。中石化生产环境默认关闭。

---

## 5. 大模型生成：提示词约束 + 引用回填

### 5.1 提示词配置

业务编排层 `AssistantService.create`（[apps/server/src/modules/assistant/assistant.service.ts:193-198](../apps/server/src/modules/assistant/assistant.service.ts#L193-L198)）把用户填写的 prompt 编译成 `prompt_config`：

```ts
prompt_config: {
  system:        prompt,                                       // 用户的 system 模板
  prologue:      opener,                                       // 开场白
  parameters:    [{ key: 'knowledge', optional: false }],      // 强制存在 {knowledge} 占位
  empty_response: emptyResponse,                               // 兜底文案
  quote:         hasKnowledgeBase,                             // 是否做引用回填
}
```

`parameters.optional:false` 是契约约束——RAG 内核在渲染模板时会校验 `{knowledge}` 必须出现，缺失即报错。这避免了"用户写了一个不带 `{knowledge}` 的 system，结果 LLM 完全不引用知识"的硅基失误。

LLM 参数默认（[assistant.prisma](../apps/server/prisma/models/assistant.prisma)）：

```
temperature=0.1, top_p=0.3, presence_penalty=0.4, frequency_penalty=0.7, max_tokens=512
```

低温度 + 高 frequency_penalty 是"知识问答场景反幻觉"的标准配方。

### 5.2 `{knowledge}` 占位符注入

[dialog_service.py:448-461](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
knowledges = kb_prompt(kbinfos, max_tokens)             # 把 chunks 序列化为带 ID 的文本
kwargs["knowledge"] = "\n------\n" + "\n\n------\n\n".join(knowledges)
msg = [{"role": "system",
        "content": prompt_config["system"].format(**kwargs) + attachments_}]
```

`kb_prompt()` 在每个 chunk 前打 `ID:N` 标记（如 `[ID:3]`），并把 `docnm_kwd / page_num_int` 等元信息嵌入文本。这是"为什么 LLM 能自报引用"的源头。

### 5.3 引用约束提示词

L462-464：

```python
if knowledges and (prompt_config.get("quote", True) and kwargs.get("quote", True)):
    prompt4citation = citation_prompt()
```

`citation_prompt()` 拼接一段专门的"请在每条事实后用 `[ID:n]` 引用"硬约束。模型只要听话，输出里就直接带证据标记。

### 5.4 空知识硬兜底

[dialog_service.py:452-456](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
if not knowledges and prompt_config.get("empty_response"):
    empty_res = prompt_config["empty_response"]
    yield {"answer": empty_res, "reference": kbinfos, "prompt": ..., "audio_binary": tts(...), "final": True}
    return
```

检索为空且配了 `empty_response`，**直接 yield 兜底文本，不调 LLM**——零 token 消耗、零幻觉风险。这是企业知识库的硬要求："不知道就说不知道，不要瞎编"。

### 5.5 双层引用回填

引用做了**两层冗余**：

**第一层：LLM 自标 `[ID:n]`**（由 `citation_prompt()` 约束）。首选，因为模型在生成时已知每句对应的证据。

**第二层：后处理 `insert_citations()`** 作为兜底。[dialog_service.py:485-489](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
if embd_mdl and not re.search(r"\[ID:([0-9]+)\]", answer):     # 模型没自标才兜底
    answer, idx = retriever.insert_citations(
        answer,
        [ck["content_ltks"] for ck in kbinfos["chunks"]],
        [ck["vector"]       for ck in kbinfos["chunks"]],
    )
```

`insert_citations(answer, chunks, chunk_v, embd_mdl, tkweight=0.1, vtweight=0.9)`（[search.py:177-256](file:///root/code/ragflow/rag/nlp/search.py)）的工作方式：

1. 用正则按中英文标点切句；
2. 每句 embed；
3. 与所有候选 chunk 的向量做 `hybrid_similarity`（**词权 0.1 + 向量 0.9** 混合相似度）；
4. 每句取最相似的 ≤4 个 chunk_id 作为引用插入。

设计意图：**"模型听话则首选模型的引用（懂语义意图），模型不听话则向量兜底"**——既追求质量也保证兜底。

### 5.6 流式输出与 `<think>` 处理

[dialog_service.py:477-481](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
ans = answer.split("</think>")
think = ""
if len(ans) == 2:
    think = ans[0] + "</think>"
    answer = ans[1]
```

显式按 `</think>` 切分推理段与最终答案。`think` 段单独输出但**不参与引用回填**（不污染句级匹配）。这是为 DeepSeek-R1 / QwQ 等推理模型量身做的工程支撑。

流式接口 [dialog_service.py:199](file:///root/code/ragflow/api/db/services/dialog_service.py)：

```python
async for delta_ans, _ in chat_mdl.async_chat_streamly_delta(...):
    yield {...}
```

SSE 帧载荷：`{ answer, reference, prompt, audio_binary, final }`。`reference` 在流末才填齐（[dialog_service.py:486-488](file:///root/code/ragflow/api/db/services/dialog_service.py)）；业务编排层把这条流原样转给前端，前端典型实现是"边收边渲染 answer，end 事件到达时刷新引用气泡"。

### 5.7 LLM 后端抽象

`rag/llm/chat_model.py` 的 `LLMBundle` 把 OpenAI / Tongyi / Zhipu / Ollama / Xinference / Bedrock / Volc 等十余家封装成统一接口。业务编排层通过 `Assistant.modelName` 持久化（格式 `model@provider`），新增 LLM 后端零代码改动。`ASSISTANT_DEFAULT_MODEL` 未配时，业务层自动调 `GET /v1/llm/list` 取第一个可用 chat 模型作默认（[apps/server/src/modules/assistant/assistant.service.ts:520-536](../apps/server/src/modules/assistant/assistant.service.ts#L520-L536)）——支持"RAG 内核挂了什么模型，前台立即可用"。

---

## 6. 端到端数据流

### 6.1 文档摄入流

```
Vue 上传组件
  → NestJS KnowledgeBaseService.uploadDocument()
      → (.docx) DocxPreprocess (pandoc 规范化)
      → 转发 POST /datasets/{id}/documents (multipart)
  → RAG 内核 FileService → MinIO（原始文件）
  → 调用 POST /datasets/{id}/chunks → task_executor 入 Redis 队列
  → DeepDOC (OCR + Layout + TSR) → 结构化 boxes
  → Chunker (chunk_method) → naive_merge / hierarchical_merge / tokenize_table
  → 可选 RAPTOR (GaussianMixture + LLM 摘要 → 多层)
  → 可选 GraphRAG (实体抽取 + 社区检测 + 报告)
  → Embedding (q_{dim}_vec)
  → 写入 ES / Infinity + 元数据回写 MySQL
  → 业务编排层轮询同步 document.run = 'DONE' 至前端
```

### 6.2 问答流

```
Vue + EventSource 提问
  → NestJS Assistant.chatStream() (requestStream → Express res pipe)
  → RAG 内核 async_chat() → 取会话历史 + 助手配置 + LLM/Embedding/Rerank 模型
  → FulltextQueryer.question(qst, min_match=0.3) → BM25 多字段加权 query
  → Dealer.get_vector(qst, emb_mdl, topk=1024, sim=0.1) → q_{dim}_vec ANN query
  → Dealer.search → FusionExpr weighted_sum(0.05 BM25 + 0.95 vector)
  → (空结果回退:min_match 0.3→0.1, sim 0.1→0.17 重试)
  → 可选 Rerank cross-encoder (Jina) → top_n=6
  → retrieval_by_children (mom_id → 父块原文合并)
  → 可选 toc_enhance / use_kg / Tavily 扩展上下文
  → kb_prompt() 序列化 chunks → 注入 system.format(knowledge=...)
  → citation_prompt() 拼接 [ID:n] 引用约束
  → LLM.async_chat_streamly_delta() → 含 <think> 段处理
  → SSE { answer, reference, prompt } 透传业务编排层 → 前端
  → 流末:模型未自标则 insert_citations() 句级兜底
       (tkweight=0.1, vtweight=0.9, ≤4 引用/句)
  → 前端渲染答案 + 引用 chip + 点击跳转到 position_int 原文坐标
```

---

## 7. 系统设计亮点（论文 Contribution 段建议）

1. **三层架构按工作负载分离**：表现层 Vue / 业务编排层 NestJS / RAG 内核 Python。NestJS 善 IO 编排，Python 善 ML 计算；SSE 透传不引入额外 buffering，首 token 延迟仅受内核 + RTT 影响。
2. **业务域 / RAG 域存储职责分离**：业务域（PG/Redis/MinIO）按业务节奏迭代，RAG 域（MySQL/ES/Infinity/Redis/MinIO）按算法节奏迭代，弱关联通过 `datasetId / assistantId` 维护。
3. **DeepDOC 三 ONNX 视觉解析栈**（OCR + LayoutRecognizer + TSR）替代纯文本解析，对中文工程文档（含复杂合并单元格表格、嵌入式公式）显著优于 PyMuPDF/Unstructured。
4. **几何坐标 + 版面语义贯穿全链**：从解析到检索结果再到前端，`position_int` 字段使"点击引用跳转原文 PDF 坐标"成为端到端能力。
5. **动态维度向量列 `q_{dim}_vec`** 支持同库多 embedding 共存，模型可在线演进无需重建索引。
6. **FusionExpr 跨引擎融合算子**：BM25 与向量在存储引擎内部完成融合（ES `script_score` / Infinity 原生 `FUSION`），少一次客户端合并。
7. **父子映射 `mom_id` + `retrieval_by_children`**：细粒度召回、粗粒度上下文，一次 DSL 完成扩展。
8. **双阈值反向回退**（min_match ↓ + similarity ↑）的生产级健壮检索。
9. **双层引用回填**（LLM 自标 `[ID:n]` 优先 + 句级 hybrid_similarity 兜底），既追求质量也保证兜底。
10. **空知识硬兜底**（empty_response 零 token 消耗、零幻觉）满足企业知识库的"不知道就说不知道"硬要求。
11. **`<think>` 段原生剥离**适配 DeepSeek-R1 / QwQ 等推理模型。
12. **存储引擎与 LLM 后端均可插拔**（DOC_ENGINE + LLMBundle），生产灵活性。

---

## 附录：论文 IMRaD 章节映射建议

| 论文章节 | 本文档对应 |
|---|---|
| System Architecture / Document Pipeline | §0 系统总览 + §1 文档解析层 |
| Indexing Strategy | §2 向量切片层 |
| Retrieval Methodology | §3 混合召回机制 + §4 上下文扩展 |
| Generation & Citation | §5 大模型生成与引用回填 |
| Implementation & Discussion | §6 端到端数据流 + §7 系统设计亮点 |

如需把任一节扩展成对照实验设计（FusionExpr 权重敏感性、`chunk_token_num` 与 recall@k 的关系、RAPTOR 开关对长文档 EM 的影响等），可在此文档基础上继续展开。
