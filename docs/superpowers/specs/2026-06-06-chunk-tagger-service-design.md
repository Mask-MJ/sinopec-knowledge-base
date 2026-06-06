# 设计:chunk-tagger 工程化(全自动打 tag + 存量回填)

> 日期:2026-06-06 · 分支:`feat/chunk-tagger-service`
> 状态:设计已确认,待写实现计划(writing-plans)

## 1. 背景

`docs/kb-optimization-report.md` §6.6 证明:给 RAGFlow chunk 灌入 `important_keywords`(领域字典 + 正则匹配)可在客户评测集上带来 **+7.0pp**,是当前反超竞品(87.3% vs 86.7%)的关键一步。

但该能力目前只存在于评测目录的一次性脚本 [`apps/server/scripts/eval/chunk-tagger.ts`](../../../apps/server/scripts/eval/chunk-tagger.ts),且字典资产 [`sinopec-concept-dict.csv`](../../../apps/server/scripts/eval/dataset/sinopec-concept-dict.csv) / [`sinopec-regex-catalog.json`](../../../apps/server/scripts/eval/dataset/sinopec-regex-catalog.json) 也只在 `scripts/eval/dataset/`。`apps/server/src` 业务代码对 `important_keywords` 的自动化**零引用**——意味着部署到任何服务器都不会自动获得这 +7pp。

本设计把该脚本**工程化为 NestJS 服务**,让 sinopec 测试服务器上:① 新上传文档 parse 完成后**自动打 tag**;② 现有存量文档可通过**回填接口**一次性补打。

## 2. 目标 / 非目标

**目标:**
- 文档 parse 完成后,后台**全自动**为其所有 chunk 写入 `important_keywords`。
- 提供 admin 专用**回填接口**,对指定 KB 的存量(已 parse)文档全量补打。
- 全自动与回填**复用同一套打 tag 引擎**,不写两份逻辑。
- **不引入新依赖**(复用已装的 `@nestjs/schedule` + `ioredis`),**不动数据库 schema**。

**非目标(本期不做):**
- 回填接口的前端 UI 按钮(admin 经 Swagger/curl 调用即可)。
- 多实例部署下的分布式锁(当前 sinopec 测试服按单实例设计,见 §8)。
- 单 chunk PUT 失败的自动重试(失败计入日志,下次回填可补)。
- 字典内容的运营维护界面 / 在线编辑。

## 3. 关键决策(已与需求方确认)

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 触发粒度 | **全自动后台**(parse 完自动打) | 需求方明确要求免人工干预 |
| D2 | 存量覆盖 | **加内部回填接口**(admin) | 纯全自动碰不到存量,部署后无法立即见效;回填补齐 |
| D3 | 待办状态持久化 | **Redis 待办集合(Sorted Set)** | 复用已有 ioredis;重启/部署不丢在途任务;不动 DB schema |
| D4 | 后台调度机制 | 复用 **`@nestjs/schedule` `@Interval`** | 已装且 `ScheduleModule.forRoot()` 已注册;无需引入 BullMQ(库优先 + YAGNI) |

## 4. 模块布局

新增 `apps/server/src/common/chunk-tagger/`(纯能力,与 `common/docx-preprocess/` 平行):

| 文件 | 职责 |
|---|---|
| `keyword-matcher.ts` | **纯函数**:`loadDict` / `loadRegex` / `matchChunk` / `inferProjectKeywords`,从脚本原样抽出 |
| `keyword-matcher.spec.ts` | 纯函数单测(主测试战场) |
| `chunk-tagger.service.ts` | 编排"给**一个 doc** 打 tag":list chunks → `matchChunk` → `PUT important_keywords`(并发受限)。全自动与回填共用 |
| `chunk-tagger.service.spec.ts` | mock `RagflowService`,验证 list→match→PUT、并发、失败计数 |
| `chunk-tag-queue.service.ts` | Redis 待办集合管理 + `@Interval` 轮询器(状态机) |
| `chunk-tag-queue.service.spec.ts` | mock Redis + Ragflow,验证状态流转 |
| `chunk-tagger.constants.ts` | 默认常量(轮询间隔 / 超时 / 并发 / maxKeywords),允许 env 覆盖 |
| `chunk-tagger.module.ts` | wiring,export 两个 service |
| `dataset/sinopec-concept-dict.csv`<br>`dataset/sinopec-regex-catalog.json` | 字典资产,**从 `scripts/eval/dataset/` 移来作唯一真源**;eval 脚本改为引用此处,避免两份漂移 |

`KnowledgeBaseModule` 引入 `ChunkTaggerModule`:在 `parseDocuments` 触发成功后调入队;`KnowledgeBaseController` 新增回填路由。

## 5. 数据流

### 路径 A —— 全自动(新文档)

```
KnowledgeBaseService.parseDocuments(kbId, docIds)
  ├─ 现有逻辑:POST /api/v1/datasets/:datasetId/chunks  ← 触发 RAGFlow 异步 parse
  └─ 成功后:ChunkTagQueueService.enqueue(datasetId, docIds)   ← 写 Redis 待办

ChunkTagQueueService @Interval(POLL_INTERVAL_MS):
  读取 Redis 待办集合
  对每个 <datasetId:docId>:
    GET /api/v1/datasets/:datasetId/documents 查 doc.run
      run === 'DONE'            → ChunkTaggerService.tagDocument() → 成功后 ZREM
      run ∈ {'FAIL','CANCEL'}   → ZREM + logger.warn
      run ∈ {'RUNNING','UNSTART'} 且未超时 → 保留到下一轮
      入队时长 > JOB_TIMEOUT_MS → ZREM + logger.error(告警:parse 卡死/异常)
```

### 路径 B —— 回填(存量,admin)

```
POST /api/knowledge-base/:id/backfill-keywords
  ├─ assertOwnership + 校验 userData.isAdmin(非 admin → ForbiddenException)
  ├─ GET 该 KB 所有 documents → 过滤 run === 'DONE'
  ├─ 对过滤结果 enqueue 到同一 Redis 待办集合
  └─ 立即返回 202 { enqueued: N, skipped: M }   ← 不阻塞 HTTP,轮询器后台统一打
```

> 回填**不另写引擎**,只是"入队来源不同"。轮询器对待办里已 `DONE` 的 doc 会立刻进入 `tagDocument()`。

### `tagDocument(datasetId, docId)` 内部(全自动/回填共用)

```
1. 列该 doc 全部 chunk(分页,走 RagflowService 官方 GET .../documents/:docId/chunks)
2. inferProjectKeywords(docName) 得到强制项目归属 keyword
3. 每个 chunk:matchChunk(text, dict, regex, maxKeywords) ∪ projectKeywords,去重 cap maxKeywords
4. 并发受限(CONCURRENCY)PUT /api/v1/datasets/:datasetId/documents/:docId/chunks/:chunkId
      body: { important_keywords: [...] }
5. 汇总 { totalChunks, updated, empty, failed },写日志
```

## 6. Redis 待办结构

- 结构:**Sorted Set**
- key:`chunk-tag:pending`
- member:`<datasetId>:<docId>`
- score:`enqueuedAt`(毫秒时间戳)

| 操作 | 命令 |
|---|---|
| 入队 | `ZADD`(同 member 覆盖 → 重复 parse 同 doc 天然幂等) |
| 轮询取待办 | `ZRANGE 0 -1 WITHSCORES`(待办量预期小,无需分批;量大时可 `ZRANGEBYSCORE` 限批) |
| 超时判定 | `score < now - JOB_TIMEOUT_MS` |
| 完成/失败/超时移除 | `ZREM` |

## 7. 默认常量(`chunk-tagger.constants.ts`,允许 env 覆盖)

| 常量 | 默认 | 说明 |
|---|---|---|
| `POLL_INTERVAL_MS` | 30_000(30s) | 轮询待办间隔 |
| `JOB_TIMEOUT_MS` | 7_200_000(2h) | 待办最长存活,超时移除并告警 |
| `CONCURRENCY` | 5 | 单 doc 内 PUT chunk 的并发(沿用脚本值) |
| `MAX_KEYWORDS` | 30 | 单 chunk 最多 keyword 数(沿用脚本值) |

## 8. 错误处理与边界

**铁律:打 tag 链路的任何失败,绝不污染 parse 主流程。**
- `enqueue` / 轮询 / `tagDocument` 全程 try-catch + 日志降级。
- Redis 不可用 → `enqueue` 失败仅记日志,`parseDocuments` 照常返回成功(降级为"这批没自动打 tag,可手动回填兜底")。

**其它边界:**
- doc `run === 'FAIL'/'CANCEL'` → 跳过打 tag + warn。
- 单 chunk PUT 失败 → 计入 `failed` + 日志,不中断整 doc,不重试(沿用脚本行为)。
- chunk 文本为空匹配 → 跳过(沿用脚本)。
- chunk 超 embedding token 限 → PUT 失败计入 `failed`,可忽略(脚本实测占比极小)。
- 待办超时(parse 卡死)→ 移除 + error 告警日志。

**已知边界(写入 spec,本期不做,留 follow-up):**
- **多实例部署**:`@Interval` 会在每实例触发。当前 sinopec 测试服按**单实例**设计;`PUT important_keywords` 幂等(覆盖),多实例最坏是重复打一次、**无数据风险**。将来多实例时加 `SET NX` per-doc 锁即可。

## 9. 鉴权

回填接口为 admin 专用。项目**无 `@Roles`/RolesGuard**,鉴权统一在 service 层用 `userData.isAdmin` 判定(与 `assertOwnership` 一致)。回填 service 方法内:先 `assertOwnership`,再显式 `if (!userData.isAdmin) throw new ForbiddenException()`。

## 10. 资产打包(关键工程点)

`nest-cli.json` 目前**无 `assets` 配置**,SWC 不会复制 `.csv/.json` 到 dist,生产 `readFileSync` 会失败。须新增:

```jsonc
"compilerOptions": {
  "builder": "swc",
  "assets": [
    { "include": "common/chunk-tagger/dataset/**/*", "outDir": "dist" }
  ],
  "watchAssets": true,
  // ...existing
}
```

运行时用 `join(__dirname, 'dataset', 'sinopec-concept-dict.csv')` 解析(SWC 保留目录结构,`__dirname` 指向 `dist/common/chunk-tagger`)。**实现计划必须包含"build 后断言 dist 内存在 csv/json"的验证步。**

## 11. 测试策略(TDD)

1. `keyword-matcher.spec.ts` —— 纯函数全覆盖:dict 命中、regex matchAll、`inferProjectKeywords` 各项目分支、去重、cap 30、空匹配。
2. `chunk-tagger.service.spec.ts` —— mock `RagflowService`:验证 list→match→PUT 调用序列、并发上限、失败计数、汇总统计。
3. `chunk-tag-queue.service.spec.ts` —— mock Redis + Ragflow:验证 `DONE→打tag→移除`、`FAIL→移除`、`未完成→保留`、`超时→移除告警` 的状态流转;`enqueue` 幂等。
4. 回填接口 —— controller/e2e:admin 鉴权(非 admin 403)、入队数量、立即返回不阻塞。
5. 资产打包 —— build 后断言 dist 存在字典文件(plan 验证步)。

覆盖率目标 ≥ 80%(项目 testing 规则)。

## 12. 验收标准

- [ ] 新上传文档 parse 完成后,无需人工操作,其 chunk 在 RAGFlow 上带 `important_keywords`。
- [ ] admin 调 `POST /api/knowledge-base/:id/backfill-keywords` 后,该 KB 存量 doc 被补打 tag。
- [ ] 非 admin 调回填接口返回 403。
- [ ] Redis 不可用时 parse 仍成功(降级,不报错给用户)。
- [ ] `pnpm build` 后 `dist/common/chunk-tagger/dataset/` 存在两个字典文件。
- [ ] 单测覆盖率 ≥ 80%,`pnpm check:type` 通过。

## 13. 第二阶段(部署到 sinopec 服务器,本设计之外)

本设计完成并合并后,部署到 sinopec 测试服务器还需:
1. 确认 sinopec 服务连的 **RAGFlow host** 与目标 **KB(dataset)id**。
2. 部署新镜像。
3. admin 对每个存量 KB 调一次回填接口,覆盖存量文档。
4. 抽样验证 retrieval 召回质量(对照 `docs/kb-optimization-report.md` 的评测口径)。

> 这一步需要 sinopec 服务器的实际配置信息,届时单独执行。
