# chunk-tagger 工程化 — 进度 Handoff

> 最后更新:2026-06-07 · 分支:`feat/chunk-tagger-service` 用途:跨会话恢复执行。读这一份即可知道"做到哪、为什么、下一步"。

## 一句话目标

把 +7.0pp 的领域字典打 tag 能力(原本只在评测脚本 `scripts/eval/chunk-tagger.ts`)工程化为 NestJS 服务,让 **sinopec 测试服务器**:① 新文档 parse 完自动打 `important_keywords`;② 存量文档经 admin 回填接口补打。第二阶段(部署到 sinopec 服务器并回填)需届时提供该服的 RAGFlow host + 目标 KB id。

## 背景一句话

源头是"我们测试数据对比竞品强在哪":同口径 30 题客户评测我们 87.3% vs 竞品 MiniMax-2.7 86.7%,关键 +7pp 来自领域字典 `important_keywords`,但它**还没工程化、部署上去不会自动见效**——于是有了本工程化任务。详见 `docs/kb-optimization-report.md` §6.6。

## 设计与计划产物(均已 commit)

- Spec(已过 4 维对抗 review,v2.1):`docs/superpowers/specs/2026-06-06-chunk-tagger-service-design.md`
- Plan 1 实现计划(6 个 TDD task,完整代码无 placeholder):`docs/superpowers/plans/2026-06-06-chunk-tagger-plan1-core.md`
- Plan 2 实现计划(7 个 TDD task,完整代码无 placeholder,已过用户终审 + 4 处 review 修订):`docs/superpowers/plans/2026-06-07-chunk-tagger-plan2-queue.md`
  - **执行进度(subagent-driven):**
    - Task 1 ✅ `e9af4ba` — constants(POLL_INTERVAL_MS/JOB_TIMEOUT_MS/RUN/RunStatus)+ turbo globalEnv + cspell `UNSTART`
    - Task 2 ✅ `d7b889a` — `ChunkTagStore`(cache-manager 单 key + mutex,enqueue/listPending/remove,5 测试绿;eslint 强制改成 immutable spread/解构,逻辑等价)
    - **Task 3–7 待执行**,从 **Task 3(`ChunkTagQueueService` pollOnce 状态机,12 测试)** 续。后续:Task 4 module 接线 → Task 5 parseDocuments 入队 → Task 6 回填/状态接口 → Task 7 KnowledgeBaseModule 接入 + 全量验证 + Nest 启动自检。
  - 计划开头"调研已确认的现状事实"已含所有坑(命令更正、RAGFlow `run` 文本值、cache `del`、`assertOwnership` 不返 userData、mock 内联等);review 修订记录见计划末尾 Self-Review。

## 关键决策(D1–D5)

| # | 决策 | 选择 | 理由 |
| --- | --- | --- | --- |
| D1 | 触发粒度 | 全自动后台(parse 完自动打) | 需求方要求免人工 |
| D2 | 存量覆盖 | admin 回填接口 | 纯全自动碰不到存量 |
| D3 | 待办状态持久化 | **cache-manager KV(单 JSON key)+ 进程内 mutex** | 项目无可注入 ioredis 客户端,只有 cache-manager(get/set/del),无 Sorted Set |
| D4 | 后台调度 | `@nestjs/schedule` `@Interval` + `pollOnce()` 可测分离 | 已装已注册 |
| D5 | 并发 | 手写 `processBatch`(slice+Promise.all) | `p-limit@7` 是 ESM-only,与 CommonJS(SWC)`require` 不兼容 |

## 执行进度(Subagent-Driven,两阶段 review)— Plan 1 **已完成 ✅**

分支 commit(从旧到新):

```
4f77a11 docs: spec 初稿
2a956cf docs: spec 对抗 review 修订(D3 cache-manager 等)
7b7fec1 docs: spec 修 D5(p-limit→processBatch)
a0923f0 docs: Plan 1
c7d962b chore: ✅ Task 1 — 迁移字典资产 + nest-cli assets
b81914f docs: progress handoff
a5b78a7 feat: ✅ Task 2 — keyword-matcher 纯函数 + 单测
d271d70 feat: ✅ Task 3 — constants + matcher token (+ turbo.json globalEnv)
9c487cd feat: ✅ Task 4 — ChunkTaggerService.tagDocument + 单测
305ba69 feat: ✅ Task 5 — wire ChunkTaggerModule
5b8aea0 refactor: ✅ Task 6 — eval 脚本复用 common keyword-matcher
6d69404 fix: 🐛 分页在 total 缺失时不静默截断(最终 review 发现)
```

| Task | 状态 | 备注 |
| --- | --- | --- |
| **Task 1** 迁移资产 + nest-cli assets + build 断言 | ✅ DONE（`c7d962b`) | 字典资产落 `src/common/chunk-tagger/dataset/`,build 后落 `dist/.../dataset/` |
| **Task 2** keyword-matcher 纯函数 + 单测 | ✅ DONE（`a5b78a7`) | 11 测试。review 修:`RegexPattern.tags` 转 optional 保防御 `?? []`;`noUncheckedIndexedAccess` 下解构改 guard;补 keywords/tags 顺序锁定 + lookahead 边界测试 |
| **Task 3** constants + KEYWORD_MATCHER token | ✅ DONE（`d271d70`) | 连带在 `turbo.json` `globalEnv` 声明 `CHUNK_TAG_CONCURRENCY`/`CHUNK_TAG_MAX_KEYWORDS` |
| **Task 4** ChunkTaggerService.tagDocument + 单测 | ✅ DONE（`9c487cd` + 修复 `6d69404`) | 8 测试。review 修:1000 页安全阀命中时 warn(不静默截断);no-throw 契约写进 JSDoc;响应字段转 optional 消 lint 噪音;补零块/GET 失败边界测试;分页 total 缺失修复 |
| **Task 5** ChunkTaggerModule wiring | ✅ DONE（`305ba69`) | DI 链端到端核对:KEYWORD_MATCHER useFactory + RagflowModule。build 验证 dataset 进 dist |
| **Task 6** eval 脚本复用 common 纯函数 | ✅ DONE（`5b8aea0`) | 删 4 重复函数 + 2 interface,改 import common,repoint dataset 路径。字典/匹配逻辑漂移消除,净 +17/-95 |

**最终整体 review 结论:Ready to merge ✅**(reviewer 查 RAGFlow SDK 源码坐实 `content_with_weight`↔`content`、`important_keywords`↔`important_kwd` 映射,确认 +7pp 可在 service 复现、漂移已消除)。

## Plan 1 完成标准(5/5 PASS)

- [x] `dist/common/chunk-tagger/dataset/` 含两个字典文件(资产打包正确)
- [x] `ChunkTaggerService.tagDocument` 可注入、单测全绿(content/id 字段映射、分页、empty/failed/project-kw 注入、错误隔离)
- [x] `keyword-matcher` 纯函数单测全绿(fixture 驱动,不依赖真实词条)
- [x] eval 脚本复用 common 纯函数,无重复定义,import 链路正常
- [x] `pnpm -F @sinopec-kb/server typecheck`(chunk-tagger 0 错) 与 `build` 通过

> 验证基线:`pnpm --filter @sinopec-kb/server exec vitest run src/common/chunk-tagger` → 19 passed;`pnpm -F @sinopec-kb/server build` → 0 issues + dist 含字典。

## 遗留 / Follow-up(Plan 2 或独立处理,均**未建 issue**,待人工决定)

1. **[Plan 2 必看] constants 顶层读 env 的时序风险**:`chunk-tagger.constants.ts` 的 `CONCURRENCY`/`MAX_KEYWORDS` 在 `require` 时即读 `process.env`。本项目 `config.module.ts` 在模块顶层调 `dotenvxConfig()` 预加载 `.env`;当前 module 未接入 AppModule 故不触发。Plan 2 接入时,若这两个**可选调优参数**放在 `.env` 文件(而非真实环境变量),且 constants 先于 config.module 被 import,会静默用默认值 5/30。建议 Plan 2 把 env 读取移进 `useFactory`(或改 DI 注入)。
2. **[Minor] eval 脚本 `processBatch` 与 service 重复**:两处实现一字不差。eval 是独立 CLI 不跑在 Nest 容器,不宜直接 import service;若要去重可把 `processBatch` 从 common 旁出一个工具导出。
3. **[Minor] `inferProjectKeywords` 14 条规则硬编码**:业务数据,长期可移到 JSON 配置与字典资产并列管理。
4. **[pre-existing,非本工作] `scripts/eval/run-via-server.ts:306` typecheck 报错**(`string[]` 不可赋 `FactItem[]`):分支起点 `5dce930` 就存在,与 chunk-tagger 无关。
5. **[pre-existing] eval 脚本顶部 eslint-disable 头有失效条目**(`unicorn/no-process-exit`/`no-console` 现不再触发);**dist 含 `*.spec.js`** 是项目级既有行为(28 个,各模块都有),非 chunk-tagger 引入。

## 如何恢复执行(Plan 2)

1. 确认分支:`git -C /root/code/sinopec-knowledge-base branch --show-current` → `feat/chunk-tagger-service`
2. Plan 2 计划已就绪(`2026-06-07-chunk-tagger-plan2-queue.md`,7 个 TDD task);续用 superpowers:subagent-driven-development 从 Task 1 逐 task 执行(每 task:implementer → spec review → code quality review)。命令更正、RAGFlow `run` 文本值、cache `del`、`assertOwnership` 不返 userData 等坑都已写进计划开头的"调研已确认的现状事实"。
3. Plan 2 复用 Plan 1 产出的 `ChunkTaggerService.tagDocument(datasetId, docId, docName)`:
   - `ChunkTagStore`(cache-manager 待办,D3)+ 进程内 mutex
   - `pollOnce()` 轮询状态机(`@nestjs/schedule` `@Interval`,D4)
   - `parseDocuments` 成功后入队(全自动,D1)
   - admin 回填接口(D2;鉴权用 `@AutoPermission` + service 层 `userData.isAdmin`,项目无 `@Roles`)
   - 只读状态接口
   - 把 `ChunkTaggerModule` 接入对应 feature module 时,处理 follow-up #1 的 env 时序。
4. 第二阶段部署+回填需:目标服 RAGFlow host + KB id。

## 验证基线(已确认的事实,实现时可直接用)

- `RagflowService.request<T>(method, path, data?, config?)`:GET 时 `data` 作 query params;返回**已解包**的 `response.data.data`;RAGFlow code 102→`NotFoundException`、103→`ConflictException`。
- 官方 `GET /api/v1/datasets/:id/documents/:docId/chunks` 返回 `{ chunks:[{ id, content, ... }], total }`(字段是 `id`/`content`,**不是**脚本内部端点的 `chunk_id`/`content_with_weight`)。RAGFlow SDK 内部把 `content_with_weight` 映射为 `content`、`important_keywords` 映射为 `important_kwd`,故 service 与 eval 脚本作用于同一数据。
- `GET .../documents` 返回 `{ docs:[...], total }` 信封,支持 `?run=` 过滤;`run ∈ {UNSTART,RUNNING,CANCEL,DONE,FAIL}`(`docs/http_api_reference.md:1693`)。
- CacheModule:`{ stores: KeyvRedis, namespace:'sinopec-kb' }`,**无默认 ttl**(待办 key 不会过期)。
- 测试范式:vitest + `Test.createTestingModule`;RagflowService mock = `const ragflow = { request: vi.fn() }` + `{ provide: RagflowService, useValue: ragflow }`;matcher mock 用 `KEYWORD_MATCHER` token。
- 命令更正(Plan 1 文档里写错过):server 类型检查是 `pnpm -F @sinopec-kb/server typecheck`(**不是** `check:type`);跑单测用 `pnpm --filter @sinopec-kb/server exec vitest run <path>`(**不是** `pnpm -F ... vitest run`)。
- 鉴权:项目用 `@AutoPermission` + `PermissionsGuard`(isAdmin 短路放行),**无 `@Roles`**;admin-only 在 service 层 `userData.isAdmin`(单独查 user,`assertOwnership` 只回传 kb)。
