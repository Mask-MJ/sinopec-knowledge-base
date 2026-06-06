# 设计:chunk-tagger 工程化(全自动打 tag + 存量回填)

> 日期:2026-06-06 · 分支:`feat/chunk-tagger-service`
> 状态:设计已确认 + 已过 4 维对抗 review(v2 修订);待用户终审 → writing-plans
> 修订记录:v2 根据对抗 review 修正 D3(放弃不存在的 ioredis Sorted Set,改 cache-manager KV)、chunk 接口字段映射、超时语义、轮询重入、鉴权体系、assets 落点等;并拆为 2 个实现计划。

## 1. 背景

`docs/kb-optimization-report.md` §6.6 证明:给 RAGFlow chunk 灌入 `important_keywords`(领域字典 + 正则匹配)在客户评测集上带来 **+7.0pp**,是当前反超竞品(87.3% vs 86.7%)的关键一步。

但该能力目前只存在于评测目录的一次性脚本 [`apps/server/scripts/eval/chunk-tagger.ts`](../../../apps/server/scripts/eval/chunk-tagger.ts),字典资产也只在 `scripts/eval/dataset/`。`apps/server/src` 业务代码对 `important_keywords` 的自动化**零引用**——部署到任何服务器都不会自动获得这 +7pp。

本设计把该脚本**工程化为 NestJS 服务**,让 sinopec 测试服务器上:① 新上传文档 parse 完成后**自动打 tag**;② 现有存量文档可通过 admin **回填接口**一次性补打。

## 2. 目标 / 非目标

**目标:**

- 文档 parse 完成后,后台**全自动**为其所有 chunk 写入 `important_keywords`。
- 提供 admin 专用**回填接口**,对指定 KB 的存量(已 parse)文档全量补打。
- 全自动与回填**复用同一套打 tag 引擎**(`tagDocument`),不写两份逻辑。
- **不引入新 npm 包**:复用已装且已 wired 的 `@nestjs/schedule`、`@nestjs/cache-manager`(Redis 后端)、`p-limit`。**不动数据库 schema**。

**非目标(本期不做):**

- 回填接口的前端 UI 按钮(admin 经 Swagger/curl 调用即可)。
- 多实例部署下的跨进程分布式锁(当前 sinopec 测试服按单实例设计,见 §8)。
- 单 chunk PUT 失败的自动重试(失败计入日志,下次回填可补)。
- 字典内容 / 项目归属规则的运营维护界面或外置数据化(见 §13 已知债)。

## 3. 关键决策(已与需求方确认 + review 修订)

| #   | 决策            | 选择                                                            | 理由                                                                                              |
| --- | --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D1  | 触发粒度        | **全自动后台**(parse 完自动打)                                 | 需求方明确要求免人工干预                                                                          |
| D2  | 存量覆盖        | **加内部回填接口**(admin)                                      | 纯全自动碰不到存量,部署后无法立即见效;回填补齐                                                   |
| D3  | 待办状态持久化  | **cache-manager KV(单 JSON key)+ 进程内 mutex**〔v2 修正〕     | 项目 Redis 只经 `@nestjs/cache-manager`+`@keyv/redis` 暴露为 `CACHE_MANAGER`(get/set/del),**无 ioredis 客户端、无 Sorted Set 命令**。待办量小,单 key JSON 足够,真正零新基建,契合库优先+YAGNI |
| D4  | 后台调度        | 复用 **`@nestjs/schedule` `@Interval`** + `pollOnce()` 可测分离 | 已装且 `ScheduleModule.forRoot()` 已注册;无需 BullMQ                                              |
| D5  | 并发            | 复用已装 **`p-limit`** 替代脚本手写 `processBatch`              | 库优先                                                                                             |

> **v2 纠错说明**:v1 的 D3 写"复用已有 ioredis 跑 Sorted Set",经 review 核实 `ioredis` 虽列在 `package.json` 但 src 内**零 import**、从未 wire;Redis 全部经 cache-manager(底层 `@keyv/redis` = node-redis,非 ioredis)。`ZADD/ZRANGE/ZREM` 无客户端可用。故改为 cache-manager KV 方案。

## 4. 模块布局

新增 `apps/server/src/common/chunk-tagger/`(纯能力,与 `common/docx-preprocess/` 平行):

| 文件                                             | 职责                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `keyword-matcher.ts`                             | **纯函数**:`loadDict` / `loadRegex` / `matchChunk(text,...)` / `inferProjectKeywords(docName)`,从脚本抽出 |
| `keyword-matcher.spec.ts`                        | 纯函数单测(fixture 驱动,不依赖真实字典词条)                                                               |
| `chunk-tagger.service.ts`                        | `tagDocument(datasetId, docId, docName)`:列 chunk → match → PUT(p-limit 并发)。全自动 + 回填共用           |
| `chunk-tagger.service.spec.ts`                   | mock `RagflowService`(用官方端点真实 schema),验证字段映射、并发、失败计数、汇总                            |
| `chunk-tag-store.ts`                             | 待办存储:`@Inject(CACHE_MANAGER) Cache` + 进程内 mutex,封装 `enqueue/listPending/remove`(KV 读改写)       |
| `chunk-tag-queue.service.ts`                     | `@Interval` 薄包装 + `pollOnce()` 轮询状态机(可单独 await 测)                                              |
| `chunk-tag-queue.service.spec.ts`                | mock store + Ragflow,验证状态流转                                                                            |
| `chunk-tagger.constants.ts`                      | 常量(轮询间隔 / 超时 / 并发 / maxKeywords)+ **`run` 状态枚举常量**,允许 env 覆盖                           |
| `chunk-tagger.module.ts`                         | wiring,export `ChunkTaggerService` + `ChunkTagStore` + queue                                                |
| `dataset/sinopec-concept-dict.csv`<br>`*.json`   | 字典资产,**从 `scripts/eval/dataset/` 移来作唯一真源**;eval 脚本改引用此处,避免漂移                       |

`KnowledgeBaseModule` 引入 `ChunkTaggerModule`:`parseDocuments` 成功后调 `store.enqueue`;`KnowledgeBaseController` 新增回填路由 + 只读状态路由。

## 5. 数据流

### 5.1 `tagDocument(datasetId, docId, docName)` —— 全自动 / 回填共用引擎

```
1. 分页列该 doc 全部 chunk:
   GET /api/v1/datasets/:datasetId/documents/:docId/chunks?page=N&page_size=100
   响应信封 { data: { chunks: [{ id, content, important_keywords, ... }], total } }
   ⚠ 字段映射(官方端点 ≠ 脚本内部端点):chunk 文本读 `content`(非 content_with_weight),
     chunk 主键读 `id`(非 chunk_id)。matchChunk 入参仍是纯文本,端点无关。
   分页终止:累计达到 total 或返回空。
2. projectKws = inferProjectKeywords(docName)
3. 每个 chunk:kws = dedupe([...projectKws, ...matchChunk(content, dict, regex, MAX_KEYWORDS)]).slice(0, MAX_KEYWORDS)
4. p-limit(CONCURRENCY) 并发:
   PUT /api/v1/datasets/:datasetId/documents/:docId/chunks/:id  body { important_keywords: kws }
   单 chunk 失败 → failed++ + 日志,不中断;命中 404(chunk 失效)同样计 failed,不致命。
5. 汇总 { totalChunks, updated, empty, failed } → 结构化日志(logger.log)
```

### 5.2 路径 A —— 全自动(新文档)

`parseDocuments` 改造控制流(关键:enqueue 绝不污染 parse 主流程):

```ts
const result = await this.ragflow.request('POST', `/api/v1/datasets/${datasetId}/chunks`, { document_ids });
try {
  await this.chunkTagStore.enqueue(datasetId, documentIds); // 仅 parse 触发成功后
} catch (e) {
  this.logger.warn(`enqueue chunk-tag 待办失败(降级,可手动回填):${msg(e)}`);
}
return result; // request 抛异常则不 enqueue、直接向上抛,保持原 parse 失败语义
```

> POST /chunks 仅触发 RAGFlow 异步 parse(200 = 已受理 ≠ 已完成),所以入队后由轮询器等 `run==='DONE'` 再打。

### 5.3 轮询状态机 `pollOnce()`(`@Interval` 仅 `void this.pollOnce()` + 重入守卫)

```
if (this.isPolling) return;        // 单实例重入守卫:上一轮未完成则跳过本 tick
this.isPolling = true;
try {
  const pending = await store.listPending();          // {member: enqueuedAt}[]; 读失败 → catch 降级,不刷屏
  // 按 datasetId 分组,每个 dataset 一次 GET documents(信封 .docs)→ docId→{run,name} 映射,避免逐 doc 请求
  for (const { member, enqueuedAt } of pending) {
    const doc = lookupDoc(member);                    // 解析 datasetId:docId,从所属 dataset 的映射取 {run,name}
    switch (true) {
      case doc 不存在 (RAGFlow 102 NotFound):           → store.remove(member) + warn   // doc/KB 已删,不等超时
      case doc.run === RUN.DONE:                         → await tagDocument(...) → 成功 store.remove(member)
      case doc.run === RUN.FAIL || RUN.CANCEL:           → store.remove(member) + warn
      case doc.run === RUN.RUNNING || RUN.UNSTART:
             若 now - enqueuedAt > JOB_TIMEOUT_MS        → store.remove(member) + error(parse 卡死告警)
             否则                                        → 保留到下一轮
      default (未知 run 值):                             → 保留 + debug 日志(不误删)
    }
  }
} finally { this.isPolling = false; }
```

> **超时只在 `RUNNING/UNSTART` 分支判定**(v2 修正):`DONE` 无条件优先进 `tagDocument`,不受 `enqueuedAt` 老化影响。否则回填一次入队几百 doc 时,排队靠后的 doc 会因入队时间戳老化在轮到打 tag 前被误删。

### 5.4 路径 B —— 回填(存量,admin)

```
POST /api/knowledge-base/:id/backfill-keywords    (controller 挂 @AutoPermission,与兄弟路由一致)
  ├─ const kb = await assertOwnership(id, user)
  ├─ const userData = await prisma.user.findUniqueOrThrow({ where:{id:user.sub} })  // 单独查,assertOwnership 不回传 userData
  ├─ if (!userData.isAdmin) throw new ForbiddenException()                          // service 层硬约束
  ├─ GET .../documents(解包 .docs)→ 过滤 run===DONE → store.enqueue(datasetId, doneDocIds)
  └─ 立即返回 202 { enqueued: N, skipped: M }   ← 不阻塞 HTTP,轮询器后台统一打
```

### 5.5(可选只读)进度自证

```
GET /api/knowledge-base/:id/keyword-tag-status   (admin)
  → { pendingCount: 该 KB 在待办里的 doc 数 }   // 让 §12 验收"存量被补打"可自证;tagDocument 汇总写结构化日志
```

## 6. 待办存储(cache-manager KV,替代 v1 Sorted Set)

`ChunkTagStore` 封装,业务代码不直接碰 cache:

- 单 key:`chunk-tag:pending`(自动落在 CacheModule 的 `sinopec-kb` namespace 下)
- 值:JSON 对象 `{ "<datasetId>:<docId>": <enqueuedAt ms>, ... }`
- `cacheManager.set(key, obj)` **不传 ttl**(已确认 CacheModule 无默认 ttl,keyv 默认永不过期)→ 待办不会被动过期

| 操作          | 实现(进程内 mutex 串行 read-modify-write,防 enqueue/poll 交错丢更新)            |
| ------------- | ------------------------------------------------------------------------------- |
| `enqueue`     | get → 对每个 member 写 `enqueuedAt`(已存在则覆盖时间戳,天然幂等)→ set         |
| `listPending` | get → `Object.entries` 返回 `{member, enqueuedAt}[]`(为空返回 `[]`)            |
| `remove`      | get → `delete obj[member]` → set                                                |

> 待办量预期为"近期 parse / 回填的 doc 数"(数十量级),单 key 全量读写成本可忽略。单实例下 mutex 即可保证读改写原子;多实例见 §8。

## 7. 常量(`chunk-tagger.constants.ts`,允许 env 覆盖)

| 常量               | 默认           | 说明                                       |
| ------------------ | -------------- | ------------------------------------------ |
| `POLL_INTERVAL_MS` | 30_000(30s)    | 轮询待办间隔                               |
| `JOB_TIMEOUT_MS`   | 7_200_000(2h)  | **仅** RUNNING/UNSTART 未完成的最长等待    |
| `CONCURRENCY`      | 5              | 单 doc 内 PUT chunk 的 p-limit 并发        |
| `MAX_KEYWORDS`     | 30             | 单 chunk 最多 keyword 数                   |
| `RUN`(枚举常量)   | `{ UNSTART, RUNNING, CANCEL, DONE, FAIL }` | 取值见 `docs/http_api_reference.md:1693`;避免内联字面量 |

## 8. 错误处理与边界

**铁律:打 tag 链路的任何失败,绝不污染 parse 主流程。**

- `enqueue` / `pollOnce` / `tagDocument` 全程 try-catch + 日志降级。
- `enqueue` 失败 → 仅 `logger.warn`,`parseDocuments` 照常返回成功(降级:可手动回填兜底)。
- `pollOnce` 内 Redis/cache 读失败 → catch 降级,不每 30s 刷屏(降频告警)。

**生命周期 / 并发边界:**

- **单实例轮询重入**:`@Interval` 不等上一轮完成;大 doc / 回填批量可能 > 30s。用 `isPolling` 守卫(§5.3),上一轮未完成则跳过本 tick。**这是单实例真问题,不靠 §多实例 兜。**
- **doc/KB 在待办期间被删**:轮询 GET/PUT 命中 RAGFlow 102 → `NotFoundException` → 视为不可恢复,`remove(member)` + warn,不等超时。`removeDocuments`/`remove` 是否反向清待办:**本期不主动清**(轮询命中 NotFound 自愈),标为已知边界。
- **re-parse 已打 tag 的 doc**:RAGFlow 重 parse 重建 chunk(id 全变),旧 keyword 随旧 chunk 消失。`enqueue` 覆盖会重置 `enqueuedAt`,轮询等新一轮 `DONE` 再打;对已失效 chunkId 的 PUT 命中 404 计入 `failed`,不致命。
- doc `run` 未知值 → 保留 + debug(不误删)。
- 单 chunk 空匹配 → 跳过(计 `empty`)。
- chunk 超 embedding token 限 → PUT 失败计 `failed`,占比极小可忽略。

**已知边界(本期不做,留 follow-up):**

- **多实例部署**:`@Interval` + KV read-modify-write 在多实例下有竞态;`isPolling` 仅进程内。当前 sinopec 测试服按**单实例**设计;`PUT important_keywords` 幂等(覆盖),最坏重复打一次、**无数据风险**。将来多实例需换 Redis 原生原子结构(届时引入 ioredis provider)或分布式锁。

## 9. 鉴权

项目用 **`@AutoPermission` + `PermissionsGuard` 权限码体系**(GET→read / POST→create…),`KnowledgeBaseController` 所有写路由都挂 `@AutoPermission`;`PermissionsGuard` 对 `isAdmin` 用户短路放行。**无角色级 `@Roles`**。

回填 / 状态路由:

- controller 层:**仍挂 `@AutoPermission`**,与兄弟路由保持权限码体系一致(admin 经 guard `isAdmin` 短路天然放行;非 admin 普通用户即使有权限码也被 service 拦)。
- service 层:**admin-only 硬约束**——`assertOwnership` 后**单独** `prisma.user.findUniqueOrThrow({where:{id:user.sub}})` 取 `isAdmin`(`assertOwnership` 只回传 `kb`,不回传 userData;与 `create()`/`findAll()` 同款),`if (!userData.isAdmin) throw new ForbiddenException()`。

## 10. 资产打包(关键工程点)

`nest-cli.json` 当前**无 `assets` 配置** + SWC builder → `.csv/.json` 不会进 dist,生产 `readFileSync` 失败。须新增,且 **outDir 必须落到模块目录**(否则被拍平到 dist 根,与运行时解析路径不符):

```jsonc
"compilerOptions": {
  "builder": "swc",
  "assets": [
    { "include": "common/chunk-tagger/dataset/**/*", "outDir": "dist/common/chunk-tagger/dataset" }
  ],
  "watchAssets": true
  // ...existing
}
```

运行时:`join(__dirname, 'dataset', 'sinopec-concept-dict.csv')`(`__dirname` = `dist/common/chunk-tagger`)。
**实现计划第一步**就跑 `pnpm build` + `ls dist/common/chunk-tagger/dataset/` 断言两文件存在(写任何业务代码前先锁死资产落点,并验证 SWC assets 语义,不假设 tsc 行为)。

## 11. 测试策略(TDD,覆盖率 ≥ 80%)

1. `keyword-matcher.spec.ts` —— 纯函数:用**内联 fixture**(临时 csv/json 字符串)驱动 `loadDict`/`loadRegex`/`matchChunk`/`inferProjectKeywords`,覆盖 dict 命中、regex matchAll、各项目分支、去重、cap 30、空匹配;**不对真实 dataset 词条断言**(避免字典内容变更打挂测试,真实文件存在性由 §11.5 覆盖)。
2. `chunk-tagger.service.spec.ts` —— mock `RagflowService`,**用官方端点真实 schema(`{chunks:[{id,content}]}` 信封)**:验证字段映射(读 content/id)、分页、p-limit 并发(mock PUT 返回受控 deferred,断言未 resolve 时在途 PUT ≤ CONCURRENCY;若不稳则降级为"PUT 次数 = 非空 chunk 数 + failed 计数正确")、汇总统计。
3. `chunk-tag-store.spec.ts` + `chunk-tag-queue.service.spec.ts` —— mock `CACHE_MANAGER`(`{get,set,del}`)+ Ragflow:验证 store 读改写幂等;`await pollOnce()` 驱动状态流转(`DONE→打tag→remove`、`FAIL/CANCEL→remove`、`NotFound→remove`、`RUNNING 未超时→保留`、`RUNNING 超时→remove告警`、`DONE 不受老化影响`)、`isPolling` 重入守卫。
4. 回填鉴权 —— **service 单测**(非 controller):mock `prisma.user.findUniqueOrThrow` 返回 admin / 非 admin,断言非 admin 抛 `ForbiddenException`、admin 走到 `enqueue`。复用已有 `createMockAdminUser`/`createMockActiveUser`/`createMockPrismaService` 工厂。
5. 资产打包 —— `pnpm build` 后断言 `dist/common/chunk-tagger/dataset/` 存在 csv/json(plan 验证步,跑在业务代码前)。

## 12. 验收标准

- [ ] 新上传文档 parse 完成后,无需人工操作,其 chunk 在 RAGFlow 上带 `important_keywords`。
- [ ] admin 调 `POST /api/knowledge-base/:id/backfill-keywords` 后,该 KB 存量 doc 被补打 tag;`GET .../keyword-tag-status` 可见待办计数归零、日志见汇总。
- [ ] 非 admin 调回填接口返回 403。
- [ ] Redis/cache 不可用时 parse 仍成功(降级,不报错给用户)。
- [ ] `pnpm build` 后 `dist/common/chunk-tagger/dataset/` 存在两个字典文件。
- [ ] 单测覆盖率 ≥ 80%,`pnpm check:type` 通过。

## 13. 实现计划拆分(建议给 writing-plans)

review 指出本 spec scope 偏大(8 文件 + 两条数据流 + 队列选型 + 鉴权 + 资产),建议拆 **2 个独立可合并的实现计划**:

- **Plan 1(低风险,可独立合并见效)**:`keyword-matcher` 纯函数抽取 + dataset 迁移到 `common/chunk-tagger/dataset/` + `nest-cli` assets 配置 + eval 脚本改引用 + `ChunkTaggerService.tagDocument`(单 doc 打 tag,可被手动/脚本直接调用,**先不接队列**)。零外部依赖争议。
- **Plan 2(依赖 Plan 1)**:`ChunkTagStore`(cache-manager 待办)+ `pollOnce` 轮询状态机 + `parseDocuments` 成功后入队 + admin 回填接口 + 只读状态接口。

## 14. 已知技术债(写入 spec,本期不解决)

- `inferProjectKeywords` 含 14 条 sinopec 专有项目名硬编码正则(顺8井北 / 方山新井 / 页岩气…)。抽到 `common/chunk-tagger` 后对所有 KB 全自动生效;对非这些项目的 doc 返回 `[]`(无害),但**新增项目需改代码 + 重新打包**。后续可考虑随字典一并外置为数据资产(同一治理路径)。

## 15. 第二阶段(部署到 sinopec 服务器,本设计之外)

本设计(Plan 1 + 2)合并后,部署到 sinopec 测试服务器还需:

1. 确认 sinopec 服务连的 **RAGFlow host** 与目标 **KB(dataset)id**。
2. 部署新镜像。
3. admin 对每个存量 KB 调一次回填接口,覆盖存量文档。
4. 抽样验证 retrieval 召回质量(对照 `docs/kb-optimization-report.md` 评测口径)。

> 这一步需要 sinopec 服务器的实际配置信息,届时单独执行。
