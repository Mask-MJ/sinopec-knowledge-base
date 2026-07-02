# RAGFlow RAG 机制答疑纪要

> 配套流程图：[ragflow-dataflow.drawio](ragflow-dataflow.drawio)（VSCode Draw.io 插件 / drawio 桌面端打开）
> 配套设计文档：[rag-system-design.md](rag-system-design.md)
> 所有源码锚点基于本机 RAGFlow 源码（仓库内软链 `ragflow-src/` → `/root/code/ragflow`）。

---

## 0. 一句话总纲

> **父子映射与 RAPTOR 是「可组合但不平级」的两类增强：父子映射是检索期、规则驱动、召回与上下文分离的无损原文聚合（2 层）；RAPTOR 是构建期（与 GraphRAG 同层）、语义驱动、召回与呈现合一的有损递归抽象（N 层）。**
>
> **BM25 ＋ 向量相似度只是「打分器」，自始至终在一个扁平候选池上排序，不认识任何树。RAPTOR 在打分【前】把摘要块拍扁铺进池子；父子映射在打分【后】把命中的细块折叠成父块原文。**

---

## 1. 切分：chunk_method 与切换的影响

- RAGFlow 内核内置 10 种 `chunk_method`（naive / paper / book / table / qa / manual / laws / picture / presentation / one），本系统启用其中 6 种（以系统界面为准）。
- **切换分片策略会发生什么**：
  1. **走不同的切片函数** → 同一份文档被切成块的**粒度和边界不同**（naive 按 token 滑窗 / table 按行 / qa 按问答对 / book 按章节层级）。
  2. **产出的特征字段不同** → qa 多 `question_kwd`、table 打 `doc_type_kwd:"table"`、章节型（book/manual/laws）产 `mom_id` 父子结构。
  3. **检索期能吃到的字段不同** → 例如 BM25 多字段加权里的 `question_tks` 只有 qa 切法才有数据。
- 切分是一切的**基础**：§2.2/2.3/2.4/2.5 都建立在切分产物之上。

## 2. 四个概念的层次定位（不要混为一谈）

| 概念 | 属于哪一层 | 性质 |
|---|---|---|
| chunk_method 切分 | **基础**（必经） | 决定块的粒度/边界/字段 |
| 父子映射 `mom_id` | 切分产物的组织 ＋ **检索期**扩展 | 规则驱动、零 LLM、近乎零成本 |
| RAPTOR | **构建期**可选增强 | 语义驱动、重计算、依赖 LLM |
| GraphRAG | **构建期**可选增强（与 RAPTOR 同层） | 最重、默认关 |

- **父子映射**：大块切小块、小块持父引用 → 2 层；母块对召回透明（内部节点），叶子被召回后回溯父块。类似组合模式。
- **RAPTOR**：在切片之上**递归聚类 + 摘要** → N 层。
- **GraphRAG**：从切片中抽实体/关系、聚成 community report，提供「块检索之外的第二套数据模型」（如「X 项目由哪个部门负责」）。很慢、很耗性能，一般不用。

## 3. RAPTOR 自己做切分和嵌入吗？

**不做。** 切分始终用 chunk_method，叶子块的嵌入也是正常 embedding 流程做好的。RAPTOR 是**构建期后处理**：

- 从已入库的叶子块读出「正文 ＋ 现成向量」（`ragflow-src/rag/svr/task_executor.py:815`）；
- UMAP 降维 ＋ 高斯混合（GMM）软聚类（`ragflow-src/rag/raptor.py:180`）；
- 每簇 LLM 摘要，摘要用**同一个 embedding model** 嵌入（`ragflow-src/rag/raptor.py:151`）；
- 递归向上直到收敛，所有新增摘要节点**平铺写回同一索引**（`ragflow-src/rag/svr/task_executor.py:799`）。

## 4. RAPTOR 的检索：collapsed tree（拍扁），不是逐层下钻

- 「树」只是构建期的概念，**层级边不落库**：`__call__` 只 `return` 一个扁平节点列表（`ragflow-src/rag/raptor.py:218`），内存里的层级信息建完即弃。
- 摘要节点入库后字段里**没有 `mom_id`、没有 layer**（`ragflow-src/rag/svr/task_executor.py:789`），物理上无从遍历。
- `raptor_kwd` 标记**只用于删除/重建定位**（`ragflow-src/api/apps/kb_app.py:835`），检索路径完全不引用它。
- 结论：摘要块与叶子块在**同一个扁平池**里被同一套混合检索打分召回。

## 5. 检索时哪几个会被用到？调用逻辑

- **父子映射 ＋ RAPTOR**：入库时就处理好，**召回自动带上**，无需显式开关。
  - 父子映射：每次问答检索后无条件触发 `retrieval_by_children`（`ragflow-src/api/db/services/dialog_service.py:436`）；文档无父子结构时自动 no-op。
  - RAPTOR：摘要块已在索引里，作为普通块被召回。
- **GraphRAG**：需显式 `use_kg=true` 才走 community 检索；很慢，默认关。

## 6. 父子映射和 RAPTOR 平级吗？

**可组合，但不平级。** 三个维度都不在一层：

- **阶段**：父子映射主要活在**检索期**（写入侧只是一个 `mom_id` 字段）；RAPTOR 完全在**构建期**（独立 task ＋ `use_raptor` 开关）。
- **成本**：父子映射零 LLM、一次 ES `get`；RAPTOR 是 GMM ＋ 多轮 LLM 摘要 ＋ 重嵌入。
- **数据结构**：父子映射**把父子边存进库**（`mom_id`）且检索时用它；RAPTOR **不存任何层级边**。
- 真正和 RAPTOR 平级的是 **GraphRAG**（都是可选 / 构建期 / 重计算 / 依赖 LLM）。

## 7. RAPTOR 多层抽象的作用是什么？

解决**跨段落/章节的全局、概括性问题**——单个细块答不了「这份年度规划的总体目标是什么」「整个手册讲了哪几块」，需要更高层的摘要块来命中。适合长文档（年报、季报、规划、综述）；短文档 / 事实点查（设备编号、规范第几条）不建议开（白烧 token ＋ 引噪声）。

## 8. 「相似度 ＋ BM25」和「树」是什么关系？

- **打分器（BM25 ＋ 向量相似度，FusionExpr 0.05:0.95）** 作用在一个**扁平候选池**上，只看每个块的文本和向量，**不认识任何树/层级**。
- **RAPTOR 树**：在打分**之前**（建库期）就拍扁成摘要节点进池 → 与叶子块同台竞争 topN。
- **父子树**：在打分**之后**（检索期）才用 `mom_id` 边做「子→父」替换；打分时进池竞争的是子块，父块不参与打分，是召回后按 id 精确 `get` 取回（`ragflow-src/rag/nlp/search.py:680`）。
- **一句话**：打分永远在扁平池上做，树要么在打分前把内容铺进池子（RAPTOR），要么在打分后对结果重组（父子），都不改变「打分本身」。

## 9. RAPTOR 召回的结果 和 父子映射的结果 是什么关系？

- **不是两套结果**，是同一个 `topN` 列表里的两类块（一次池、一次打分、一个 topN）。
- RAPTOR 摘要块与叶子块同池竞争 → topN 里可能混着两者。
- 父子映射**不产生新结果**：只把 topN 里命中的叶子块**折叠替换**成父块原文（不新增条目、不碰 RAPTOR 摘要块——摘要块无 `mom_id` 跳过，`ragflow-src/rag/nlp/search.py:667`）。
- 最终上下文里二者**互补**：RAPTOR 摘要块＝**全局视角**（答概括/汇总），父块原文＝**局部完整**（答细节）。典型 global ＋ local 组装。
- 副作用：摘要块与某父块可能讲同一段（摘要版 ＋ 原文版并存），collapsed tree 无去重。

## 10. 「检索到子块，连带把同级子块一起召回」这个说法对吗？

**措辞要校正。** 真实机制是：命中子块 → 按 `mom_id` 反查**父块** → 把同一父块下命中的子块**折叠成一条**，用**父块整段原文**呈现给 LLM（`ragflow-src/rag/nlp/search.py:684`）。不是「逐个召回没命中的兄弟子块」，而是「上钻到父块给整节原文」——因为父块原文本就涵盖整节，效果上同节内容确实一起进来了，但**不额外占 topN 名额**。

---

## 附：源码锚点清单

| 主题 | 位置 |
|---|---|
| RAPTOR 主体（GMM 聚类 / 摘要 / 递归 / 返回扁平列表） | [ragflow-src/rag/raptor.py](ragflow-src/rag/raptor.py#L112) |
| RAPTOR 摘要再嵌入（同一 embedding model） | [ragflow-src/rag/raptor.py:151](ragflow-src/rag/raptor.py#L151) |
| RAPTOR 读已入库叶子的现成向量 | [ragflow-src/rag/svr/task_executor.py:815](ragflow-src/rag/svr/task_executor.py#L815) |
| RAPTOR 摘要节点写回索引（无 mom_id，打 raptor_kwd） | [ragflow-src/rag/svr/task_executor.py:789](ragflow-src/rag/svr/task_executor.py#L789) |
| raptor_kwd 仅用于删除定位 | [ragflow-src/api/apps/kb_app.py:835](ragflow-src/api/apps/kb_app.py#L835) |
| 混合检索打分（BM25 + 向量 + FusionExpr） | [ragflow-src/rag/nlp/search.py:74](ragflow-src/rag/nlp/search.py#L74) |
| 父子扩展 retrieval_by_children（子→父，取父块原文） | [ragflow-src/rag/nlp/search.py:658](ragflow-src/rag/nlp/search.py#L658) |
| 父子扩展默认触发 | [ragflow-src/api/db/services/dialog_service.py:436](ragflow-src/api/db/services/dialog_service.py#L436) |
