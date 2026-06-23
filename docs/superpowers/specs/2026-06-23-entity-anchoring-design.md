# 实体锚定（Entity Anchoring）设计 — 验证阶段

- 日期：2026-06-23
- 状态：已批准，待实施
- 前置证据：`docs/rag-retrieval-replay-diagnosis-2026-06.md` §9；记忆 `rag-entity-anchoring`

## 1. 背景与目标

RAG 失败题诊断结论：剩余失败杠杆**几乎全在检索侧**。其中一类是**跨项目串台**——同区多项目（顺北42/43/21、张集东、页岩气…）在向量空间高度相似，正确文档的段被隔壁项目相似段挤出 top-N 窗口。诊断里已验证：把检索**锚定到问题点名的项目单篇文档**后，Q14 顺北42 干扰全消、正确日期段进 rank3。这是排查里唯一已验证有效且不伤别题的检索修复。

但"查询改写"在上一轮全量回归净负 **−54**，根因正是改写后串台到隔壁项目。所以本设计采用**证据优先**：先产出**路径无关的纯函数内核**，用评测证明"锚定式查询改写"端到端真有增益，**之后**才谈接入 live 聊天。

**本设计明确不碰 `completions()`、不改 RAGFlow 配置。** 接入 live 是评测证明增益后的下一个 spec。

## 2. 现有代码约束（已核实）

- `apps/server/src/modules/assistant/assistant.service.ts:100` `completions()` 仅把 `question` 透传给 RAGFlow `/api/v1/chats/{assistantId}/completions`，检索在 RAGFlow内部按助手配置（dataset_ids/top_n/top_k/权重）执行——**无 per-query 文档过滤钩子**。唯一可动杠杆 = 改写 `dto.question`。
- `apps/server/src/modules/knowledge-base/knowledge-base.service.ts:401` `retrieveChunks()` 的 `/api/v1/retrieval` 带 `document_ids` 硬过滤原语——但属独立检索端点，聊天流不走它。
- 评测工具 `apps/server/scripts/eval/retrieval-replay.ts`（只读，调 `/api/v1/retrieval`，渲染带 top_n 截断线 + gold 标注的 markdown）。

结论：验证阶段的可动杠杆 = **锚定式查询改写**，通过 retrieval-replay 的 `document_ids` （真过滤）与改写 `question`（偏置）两路都能在评测里对照。

## 3. 组件设计

每个组件小而单一职责，纯函数可独立测试。

### 3.1 `anchor-registry`

类型化的项目锚点表，验证阶段从评测集已知项目播种：

```ts
interface ProjectAnchor {
  projectName: string; // 规范名，如 "顺北43"
  aliases: string[]; // 别名/简写，如 ["顺北43井", "SB43"]
  wellNumbers: string[]; // 关联井号，如 ["顺北43", "顺北43-1H"]
}
```

- 加载时用 zod 校验（projectName 非空、数组成员非空）；脏数据 fail-fast。
- 验证阶段以静态配置文件形式存在（`scripts/eval/configs/anchor-registry.json` 或 ts 常量）。
- 生产化时改为从 dataset 文档名动态派生（项目名内嵌在文件名里）——属下一个 spec。

### 3.2 `detectAnchor(question, registry): ProjectAnchor | null`（纯）

- 在 question 内做项目名/别名/井号的**最具体匹配**（最长匹配优先，井号优先于项目名）。
- 命中返回对应锚点；question 未点名任何已知项目 → 返回 `null`（绝不乱锚）。
- 多项目同现：取最具体（井号 > 项目名）；若仍歧义不可判 → 返回 `null`（安全优先，宁可不锚也不锚错）。
- 永不抛异常。

### 3.3 `anchorQuery(question, anchor): string`（纯）

- 产出偏置 BM25（关键词权重 0.7 主导）的改写查询：把规范 projectName + 命中井号作为关键词 token 织入原 question（保留原问题语义，仅补强项目锚词）。
- 不可变（返回新串，不改入参）。
- `anchor` 为 null 时**直通 no-op**（返回原 question）。

### 3.4 `resolveDocumentIds(anchor, datasetDocs): string[]`（纯）

- 把锚点（projectName/aliases/wellNumbers）与 dataset 文档名列表匹配，返回命中的 `document_ids`。`datasetDocs: { id: string; name: string }[]` 由调用方（评测脚本）从 RAGFlow 拉好后传入，本函数零 IO、纯匹配，可独立测。
- 无命中返回 `[]`；调用方据此决定是否启用硬过滤。
- 这是 Q14 已验证的"锚定单篇"机制，评测里作为**上界 oracle** 对照（见 §3.5）。

### 3.5 评测挂钩（`retrieval-replay.ts` 加 `--anchor` 旗标）

三路对照，每题一行打在 replay.md：

- **基线**：原 question 直接检索。
- **改写**（可上线机制）：`detectAnchor → anchorQuery` 改写后检索。
- **硬过滤上界**（oracle）：`detectAnchor → resolveDocumentIds` 后用 `document_ids` 过滤检索。

- 输出标注：是否锚定、锚定到哪个项目、改写后 query、解析到的 document_ids。
- 只读，不改任何 prod 代码/配置。
- 验证逻辑：改写若能逼近硬过滤上界的 gold 入窗增益、且全量回归不再净负，则改写可上线。

## 4. 数据流

```
question
  → detectAnchor(registry) → anchor | null
  → anchorQuery(question, anchor) → 改写 query
  → RAGFlow /api/v1/retrieval（可选 document_ids 硬过滤）
  → 对比 gold 段是否进 top-N 窗口（锚定前 vs 锚定后）
```

## 5. 错误处理

- `detectAnchor` 无匹配返回 `null`，永不抛。
- `anchorQuery` 在 `anchor === null` 时直通原 question。
- registry 启动时 zod 校验，脏数据 fail-fast 并给出明确字段错误。
- 评测脚本对单题检索失败降级为告警 + 跳过，不中断整批。

## 6. 测试策略（TDD，先 RED）

**单元测试（纯函数，零 RAGFlow 依赖）：**

- `detectAnchor`：
  - 命中井号（"顺北43 的施工日期" → 顺北43 锚点）
  - 命中别名（张集东别名 → 张集东锚点）
  - 命中项目名（"页岩气…" → 页岩气锚点）
  - **未命中（泛问题不点名项目 → null，必须不锚定）**
  - 歧义（多项目同现 → 取最具体或安全返回 null）
- `anchorQuery`：
  - 锚点存在 → 改写串含规范名 + 井号、且不丢原问题语义
  - 锚点 null → 返回原 question（引用相等或值相等）
  - 不可变（入参 question 未被修改）
- `resolveDocumentIds`：
  - 锚点名/别名/井号命中文档名 → 返回对应 id（顺北43 锚点 → 顺北43 文档 id）
  - 无命中 → 返回 `[]`
  - 不误命中隔壁项目（顺北43 锚点不返回顺北42 文档 id）
- registry zod 校验：合法/非法各一例。

**评测集成（验证增益）：**

- 失败 7 题 + 全量回归跑 `--anchor` 对照，看 gold@10 与正确段入窗率较基线变化。
- 验收：锚定后 Q14 类串台题 gold 段进窗口、且全量回归不再净负。

## 7. 边界（YAGNI）

- 不动 `completions()`、不动 RAGFlow 助手配置。
- 不做动态文档名派生 registry（生产化 spec 再做）。
- 不做 Path A（检索后塞）/ Path C（RAGFlow 原生过滤）——评测证明增益后再选接入路径。

## 8. 后续（非本 spec）

评测证明增益后，新 spec 决定接入 live 的路径（B 锚定式查询改写最轻 / A 硬过滤最彻底 / C RAGFlow 原生过滤，视版本能力），并把 registry 生产化为动态派生。
