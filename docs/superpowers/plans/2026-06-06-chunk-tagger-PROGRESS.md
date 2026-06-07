# chunk-tagger 工程化 — 进度 Handoff

> 最后更新:2026-06-07 · 分支:`feat/chunk-tagger-service`
> 用途:跨会话恢复执行。读这一份即可知道"做到哪、为什么、下一步"。

## 一句话目标

把 +7.0pp 的领域字典打 tag 能力(目前只在评测脚本 `scripts/eval/chunk-tagger.ts`)工程化为 NestJS 服务,让 **sinopec 测试服务器**:① 新文档 parse 完自动打 `important_keywords`;② 存量文档经 admin 回填接口补打。第二阶段(部署到 sinopec 服务器并回填)需届时提供该服的 RAGFlow host + 目标 KB id。

## 背景一句话

源头是"我们测试数据对比竞品强在哪":同口径 30 题客户评测我们 87.3% vs 竞品 MiniMax-2.7 86.7%,关键 +7pp 来自领域字典 `important_keywords`,但它**还没工程化、部署上去不会自动见效**——于是有了本工程化任务。详见 `docs/kb-optimization-report.md` §6.6。

## 设计与计划产物(均已 commit)

- Spec(已过 4 维对抗 review,v2.1):`docs/superpowers/specs/2026-06-06-chunk-tagger-service-design.md`
- Plan 1 实现计划(6 个 TDD task,完整代码无 placeholder):`docs/superpowers/plans/2026-06-06-chunk-tagger-plan1-core.md`
- Plan 2:**待写**(队列 + 轮询 + parse 自动入队 + 回填接口 + 只读状态接口)

## 关键决策(D1–D5)

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 触发粒度 | 全自动后台(parse 完自动打) | 需求方要求免人工 |
| D2 | 存量覆盖 | admin 回填接口 | 纯全自动碰不到存量 |
| D3 | 待办状态持久化 | **cache-manager KV(单 JSON key)+ 进程内 mutex** | 项目无可注入 ioredis 客户端,只有 cache-manager(get/set/del),无 Sorted Set |
| D4 | 后台调度 | `@nestjs/schedule` `@Interval` + `pollOnce()` 可测分离 | 已装已注册 |
| D5 | 并发 | 手写 `processBatch`(slice+Promise.all) | `p-limit@7` 是 ESM-only,与 CommonJS(SWC)`require` 不兼容 |

## 对抗 review / 写计划暴露的两个根本性坑(已修正进 spec)

1. **ioredis 不存在**:v1 spec 以为 `package.json` 有 `ioredis` 就能用 Sorted Set 存待办;实际全项目 Redis 只经 `@nestjs/cache-manager`+`@keyv/redis`(node-redis)暴露,零 ioredis import,无 `ZADD/ZRANGE`。→ 改 cache-manager KV(D3)。
2. **p-limit ESM-only**:`p-limit@7` 是 `type:module`,eval 脚本能 import 是因 tsx 跑 ESM;NestJS CommonJS 运行时 `require` 会 `ERR_REQUIRE_ESM`。→ 保留 `processBatch`(D5)。

## 执行进度(Subagent-Driven,两阶段 review)

分支 commit(从旧到新):
```
4f77a11 docs: spec 初稿
2a956cf docs: spec 对抗 review 修订(D3 cache-manager 等)
7b7fec1 docs: spec 修 D5(p-limit→processBatch)
a0923f0 docs: Plan 1
c7d962b chore: ✅ Task 1 — 迁移字典资产 + nest-cli assets
```

| Task | 状态 | 备注 |
|---|---|---|
| **Task 1** 迁移资产 + nest-cli assets + build 断言 | ✅ DONE（commit `c7d962b`) | spec review ✅;code quality review 提了 1 个 Important = eval 脚本默认路径断裂 → **这是 Task 6 的活,预期中间态,非新回归** |
| **Task 2** keyword-matcher 纯函数 + 单测 | ⬜ 待执行 | 下一个 |
| **Task 3** constants + KEYWORD_MATCHER token | ⬜ 待执行 | |
| **Task 4** ChunkTaggerService.tagDocument + 单测 | ⬜ 待执行 | |
| **Task 5** ChunkTaggerModule wiring | ⬜ 待执行 | |
| **Task 6** eval 脚本复用 common 纯函数(顺带修 Task 1 留下的路径断裂) | ⬜ 待执行 | 收口 code review 的 Important |

## 如何恢复执行

1. 确认分支:`git -C /root/code/sinopec-knowledge-base branch --show-current` → `feat/chunk-tagger-service`
2. 续用 superpowers:subagent-driven-development,从 **Task 2** 开始。
3. 每个 task 文本与完整代码直接取自 Plan 1 文档(`2026-06-06-chunk-tagger-plan1-core.md`),逐 task:派 implementer → spec 合规 review → code quality review → 标记完成。
4. Task 2 起会真正写 `src/common/chunk-tagger/` 下的 TS;Task 1 已把字典资产放在 `src/common/chunk-tagger/dataset/` 并验证 build 落点 `dist/common/chunk-tagger/dataset/`。
5. 全部 6 task 完成后:派最终整体 code review → superpowers:finishing-a-development-branch → 再考虑 Plan 2。

## 验证基线(已确认的事实,实现时可直接用)

- `RagflowService.request<T>(method, path, data?, config?)`:GET 时 `data` 作 query params;返回**已解包**的 `response.data.data`;RAGFlow code 102→`NotFoundException`、103→`ConflictException`。
- 官方 `GET /api/v1/datasets/:id/documents/:docId/chunks` 返回 `{ chunks:[{ id, content, ... }], total }`(字段是 `id`/`content`,**不是**脚本内部端点的 `chunk_id`/`content_with_weight`)。
- `GET .../documents` 返回 `{ docs:[...], total }` 信封,支持 `?run=` 过滤;`run ∈ {UNSTART,RUNNING,CANCEL,DONE,FAIL}`(`docs/http_api_reference.md:1693`)。
- CacheModule:`{ stores: KeyvRedis, namespace:'sinopec-kb' }`,**无默认 ttl**(待办 key 不会过期)。
- 测试范式:vitest + `Test.createTestingModule`;RagflowService mock = `const ragflow = { request: vi.fn() }` + `{ provide: RagflowService, useValue: ragflow }`;mock 工厂在 `src/test-utils/mock.factory.ts`。
- 鉴权:项目用 `@AutoPermission` + `PermissionsGuard`(isAdmin 短路放行),**无 `@Roles`**;admin-only 在 service 层 `userData.isAdmin`(单独查 user,`assertOwnership` 只回传 kb)。
