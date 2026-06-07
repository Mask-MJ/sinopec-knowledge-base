# chunk-tagger Plan 2（队列 + 轮询 + 自动入队 + 回填/状态接口）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan 1 的 `ChunkTaggerService.tagDocument` 之上,补齐"新文档 parse 完后台**全自动**打 tag + admin **回填**存量"的闭环:cache-manager 待办存储 + `@Interval` 轮询状态机 + `parseDocuments` 成功后入队 + 回填/状态接口。

**Architecture:** `ChunkTagStore`(cache-manager 单 key JSON + 进程内 mutex)存待办 `{datasetId:docId → enqueuedAt}`;`ChunkTagQueueService` 用 `@Interval(POLL_INTERVAL_MS)` 驱动 `pollOnce()` 状态机——按 datasetId 批量 GET documents,对 `run==='DONE'` 的 doc 调 `tagDocument` 后移除,`FAIL/CANCEL`/不存在直接移除,`RUNNING/UNSTART` 超时才弃置。`parseDocuments` 成功后 `enqueue`(降级:失败仅 warn,不污染 parse);admin 回填接口列 DONE doc 批量 enqueue。打 tag 链路任何失败**绝不污染 parse 主流程**。

**Tech Stack:** NestJS + SWC(CommonJS)、`@nestjs/cache-manager`(底层 `@keyv/redis`,`Cache` 来自 `cache-manager` v7,删除用 `del`)、`@nestjs/schedule` `@Interval`(已 `forRoot` 注册)、手写 `processBatch`(Plan 1 已有)、vitest。**不引入新 npm 包、不动 DB schema。**

**Spec:** `docs/superpowers/specs/2026-06-06-chunk-tagger-service-design.md`(§5 数据流 / §6 待办存储 / §7 常量 / §8 边界 / §9 鉴权 / §11 测试)

---

## 调研已确认的现状事实（实现时直接用,不要再假设）

- **`ChunkTaggerService.tagDocument(datasetId, docId, docName)`**(Plan 1 已建,`chunk-tagger.service.ts`)返回 `{ totalChunks, updated, empty, failed }`;单 PUT 失败计 `failed` 不抛,但列 chunk 的 GET 失败会向上 reject。
- **`chunk-tagger.constants.ts`**(Plan 1)已导出 `CONCURRENCY`/`MAX_KEYWORDS`/`KEYWORD_MATCHER`。本计划往里追加 `POLL_INTERVAL_MS`/`JOB_TIMEOUT_MS`/`RUN`。
- **`ChunkTaggerModule`**(Plan 1)`imports:[RagflowModule]`,`providers:[ChunkTaggerService, {KEYWORD_MATCHER useFactory}]`,`exports:[ChunkTaggerService]`。
- **RAGFlow `GET /api/v1/datasets/:id/documents`**(SDK 端点)返回信封 `{ docs:[{ id, name, run, ... }], total }`。**`run` 是文本**:SDK 端点用 `{"0":"UNSTART","1":"RUNNING","2":"CANCEL","3":"DONE","4":"FAIL"}` 把 DB 数字映射成文本输出。`TaskStatus.SCHEDULE="5"` 未在映射表→输出 `"5"`(落"未知 run 值"分支,保留)。
- **`RagflowService.request<T>(method, path, data?, config?)`**:GET 时 `data` 作 query params;返回**已解包**的 `response.data.data`;RAGFlow code 102→`NotFoundException`、103→`ConflictException`。
- **`CACHE_MANAGER`**:`import { CACHE_MANAGER } from '@nestjs/cache-manager'` + `import type { Cache } from 'cache-manager'`;注入 `@Inject(CACHE_MANAGER) private readonly cache: Cache`。API:`cache.get<T>(key)`、`cache.set(key, value)`(**无 ttl**)、`cache.del(key)`(**是 `del` 不是 `delete`**)。CacheModule 全局(namespace `sinopec-kb`),业务 module **无需** import。
- **`@nestjs/schedule`**:`ScheduleModule.forRoot()` 已在 `app.module.ts` 注册;项目**零 `@Interval` 先例**,本计划首用。`import { Interval } from '@nestjs/schedule'`。
- **`KnowledgeBaseService`**(`src/modules/knowledge-base/knowledge-base.service.ts`):
  - constructor:`@Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService`、`private readonly ragflow: RagflowService`、`private readonly docxPreprocess: DocxPreprocessService`;`private readonly logger = new Logger(KnowledgeBaseService.name)`。
  - `parseDocuments(id: number, user: ActiveUserData, documentIds: string[])`(248-261):`assertOwnership`→`requireDatasetId`→`ragflow.request('POST', .../chunks, { document_ids })`。
  - `private assertOwnership(id, user)`:**只返回 `kb`,不返 userData**;内部用 `this.prisma.client.knowledgeBase.findUniqueOrThrow` + `this.prisma.client.user.findUniqueOrThrow`。
  - `private requireDatasetId(kb: { datasetId: null|string; id: number }): string`。
  - isAdmin 判定模式(同 `create()`):`const userData = await this.prisma.client.user.findUniqueOrThrow({ where: { id: user.sub } }); if (!userData.isAdmin) ...`。`ActiveUserData = { sub: number; username: string; nickname: string; roles: string[] }`(**`sub` 是 number**)。`User.isAdmin: Boolean`。
- **`KnowledgeBaseController`**(`knowledge-base.controller.ts`)路由模板:`@AutoPermission() @Post(':id/parse') parseDocuments(@Param('id') id: number, @ActiveUser() user: ActiveUserData, @Body() dto) {...}`。装饰器 import:`@/modules/auth/authorization/decorators/auto-permission.decorator`、`@/modules/auth/decorators/active-user.decorator`。控制器 `@Controller()` 无前缀,路由经 RouterModule 挂 `/api/knowledge-base`。
- **`KnowledgeBaseModule`**:`imports:[RagflowModule, DocxPreprocessModule]`,`controllers:[LlmController, KnowledgeBaseController]`,`providers:[KnowledgeBaseService]`(**无 exports**)。
- **测试**:无 `createMockRagflowService`/`createMockCacheManager` 工厂——内联 `{ request: vi.fn() }` / `{ get,set,del: vi.fn() }`。有 `createMockActiveUser(overrides?)`/`createMockAdminUser(overrides?)`/`createMockPrismaService()`(`src/test-utils/common.mock.ts`,经 `mock.factory.ts` 再导出;Proxy 自动生成 `findUniqueOrThrow` 等)。`PRISMA_SERVICE_TOKEN` 来自 `@/common/database/prisma.extension`。
- **命令更正**(Plan 1 文档写错过,本计划用对的):类型检查 `pnpm -F @sinopec-kb/server typecheck`(**不是** `check:type`);跑单测 `pnpm --filter @sinopec-kb/server exec vitest run <path>`(**不是** `pnpm -F ... vitest run`);`typecheck` 会残留一个 pre-existing 无关错误 `scripts/eval/run-via-server.ts:306`,只需确认 grep 不到 chunk-tagger / knowledge-base 相关新错误。

---

## 文件结构

- Modify: `apps/server/src/common/chunk-tagger/chunk-tagger.constants.ts` — 追加 `POLL_INTERVAL_MS` / `JOB_TIMEOUT_MS` / `RUN` / `RunStatus`
- Modify: `turbo.json` — `globalEnv` 追加 `CHUNK_TAG_POLL_INTERVAL_MS` / `CHUNK_TAG_JOB_TIMEOUT_MS`
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-store.ts` — 待办存储(cache KV + mutex)
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-store.spec.ts`
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.ts` — `@Interval` + `pollOnce()` 状态机
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.spec.ts`
- Modify: `apps/server/src/common/chunk-tagger/chunk-tagger.module.ts` — providers/exports 加 store + queue
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.service.ts` — constructor 注入 `ChunkTagStore`;`parseDocuments` 成功后 enqueue;新增 `backfillKeywords` / `keywordTagStatus`
- Create: `apps/server/src/modules/knowledge-base/knowledge-base.service.spec.ts` — parse 入队 + 回填鉴权 单测
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.controller.ts` — 加 `POST :id/backfill-keywords` / `GET :id/keyword-tag-status`
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.module.ts` — imports 加 `ChunkTaggerModule`

---

## Task 1: 扩展 constants（轮询间隔 / 超时 / RUN 枚举）

**Files:**
- Modify: `apps/server/src/common/chunk-tagger/chunk-tagger.constants.ts`
- Modify: `turbo.json`

- [ ] **Step 1: 追加常量到 `chunk-tagger.constants.ts` 末尾**

在文件现有三个 export 之后追加:

```ts

/** 轮询待办间隔(ms) */
export const POLL_INTERVAL_MS = Number(
  process.env.CHUNK_TAG_POLL_INTERVAL_MS ?? 30_000,
);

/** 仅 RUNNING/UNSTART 未完成的最长等待(ms),超时弃置并告警 */
export const JOB_TIMEOUT_MS = Number(
  process.env.CHUNK_TAG_JOB_TIMEOUT_MS ?? 7_200_000,
);

/**
 * RAGFlow 文档 parse 状态。
 * SDK 端点 `GET /api/v1/datasets/:id/documents` 返回前已把 DB 数字
 * (0..4) 映射为文本;SCHEDULE(5) 未映射会原样返回 '5',落"未知"分支保留。
 */
export const RUN = {
  UNSTART: 'UNSTART',
  RUNNING: 'RUNNING',
  CANCEL: 'CANCEL',
  DONE: 'DONE',
  FAIL: 'FAIL',
} as const;

export type RunStatus = (typeof RUN)[keyof typeof RUN];
```

- [ ] **Step 2: `turbo.json` 的 `globalEnv` 追加两个 env var**

在 `globalEnv` 数组里(Plan 1 已加的 `CHUNK_TAG_CONCURRENCY`/`CHUNK_TAG_MAX_KEYWORDS` 旁)追加:

```jsonc
"CHUNK_TAG_POLL_INTERVAL_MS",
"CHUNK_TAG_JOB_TIMEOUT_MS"
```

> 不加会触发 eslint `turbo/no-undeclared-env-vars`(Plan 1 Task 3 踩过)。

- [ ] **Step 3: 类型检查 + eslint**

Run:
```bash
pnpm -F @sinopec-kb/server typecheck 2>&1 | grep chunk-tagger || echo "NO chunk-tagger type errors"
cd apps/server && pnpm exec eslint src/common/chunk-tagger/chunk-tagger.constants.ts
```
Expected: `NO chunk-tagger type errors`;eslint 无输出。

- [ ] **Step 4: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tagger.constants.ts ../../turbo.json
git commit -m "feat(@sinopec-kb/server): ✨ add chunk-tag poll/timeout/RUN constants"
```

---

## Task 2: ChunkTagStore（cache-manager 待办 + 进程内 mutex）

**Files:**
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-store.ts`
- Test: `apps/server/src/common/chunk-tagger/chunk-tag-store.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/src/common/chunk-tagger/chunk-tag-store.spec.ts`:

```ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChunkTagStore } from './chunk-tag-store';

describe('ChunkTagStore', () => {
  let backing: Record<string, unknown>;
  const cache = {
    get: vi.fn((k: string) => Promise.resolve(backing[k])),
    set: vi.fn((k: string, v: unknown) => {
      backing[k] = v;
      return Promise.resolve();
    }),
    del: vi.fn((k: string) => {
      delete backing[k];
      return Promise.resolve();
    }),
  };
  let store: ChunkTagStore;

  beforeEach(async () => {
    backing = {};
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkTagStore,
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    store = moduleRef.get(ChunkTagStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueue writes each member with the current timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.enqueue('ds1', ['d1', 'd2']);
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d1', enqueuedAt: 1000 },
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
  });

  it('enqueue is idempotent and overwrites the timestamp', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000);
    await store.enqueue('ds1', ['d1']);
    now.mockReturnValueOnce(2000);
    await store.enqueue('ds1', ['d1']);
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d1', enqueuedAt: 2000 },
    ]);
  });

  it('listPending returns [] when nothing is enqueued', async () => {
    expect(await store.listPending()).toEqual([]);
  });

  it('remove deletes only the given member', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.enqueue('ds1', ['d1', 'd2']);
    await store.remove('ds1:d1');
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
  });

  it('serializes concurrent enqueues without lost updates', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    // get 推迟一个微任务,制造无锁时的交错丢更新窗口
    cache.get.mockImplementation(async (k: string) => {
      await Promise.resolve();
      return backing[k];
    });
    await Promise.all([store.enqueue('ds1', ['a']), store.enqueue('ds1', ['b'])]);
    const members = (await store.listPending()).map((p) => p.member).sort();
    expect(members).toEqual(['ds1:a', 'ds1:b']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && pnpm exec vitest run src/common/chunk-tagger/chunk-tag-store.spec.ts`
Expected: FAIL —— `Cannot find module './chunk-tag-store'`。

- [ ] **Step 3: 写 `chunk-tag-store.ts`**

创建 `apps/server/src/common/chunk-tagger/chunk-tag-store.ts`:

```ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/** 待办 cache key(自动落在 CacheModule 的 sinopec-kb namespace 下) */
const PENDING_KEY = 'chunk-tag:pending';

export interface PendingItem {
  /** `${datasetId}:${docId}` */
  member: string;
  /** 入队时间戳(ms) */
  enqueuedAt: number;
}

type PendingMap = Record<string, number>;

/**
 * chunk-tag 待办存储:cache-manager 单 key JSON + 进程内 mutex 串行 read-modify-write。
 * 单实例下 mutex 保证 enqueue/remove 交错不丢更新;多实例边界见 spec §8。
 * set 不传 ttl(CacheModule 无默认 ttl),待办不会被动过期。
 */
@Injectable()
export class ChunkTagStore {
  private mutex: Promise<unknown> = Promise.resolve();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** 入队一批 doc;member 已存在则覆盖时间戳(天然幂等)。 */
  async enqueue(datasetId: string, docIds: string[]): Promise<void> {
    const now = Date.now();
    await this.withLock(async () => {
      const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
      for (const docId of docIds) {
        map[`${datasetId}:${docId}`] = now;
      }
      await this.cache.set(PENDING_KEY, map);
    });
  }

  /** 列出全部待办(为空返回 [])。只读,不加锁。 */
  async listPending(): Promise<PendingItem[]> {
    const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
    return Object.entries(map).map(([member, enqueuedAt]) => ({
      member,
      enqueuedAt,
    }));
  }

  /** 移除一个待办 member。 */
  async remove(member: string): Promise<void> {
    await this.withLock(async () => {
      const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
      delete map[member];
      await this.cache.set(PENDING_KEY, map);
    });
  }

  /** 串行化 read-modify-write,防 enqueue/remove 交错丢更新。 */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(fn, fn);
    this.mutex = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && pnpm exec vitest run src/common/chunk-tagger/chunk-tag-store.spec.ts`
Expected: PASS(5 用例全绿)。
再 `pnpm -F @sinopec-kb/server typecheck 2>&1 | grep chunk-tagger || echo OK` → 空;`cd apps/server && pnpm exec eslint src/common/chunk-tagger/chunk-tag-store.ts src/common/chunk-tagger/chunk-tag-store.spec.ts` → 无错误。

- [ ] **Step 5: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tag-store.ts src/common/chunk-tagger/chunk-tag-store.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add ChunkTagStore cache-manager pending store"
```

---

## Task 3: ChunkTagQueueService（@Interval + pollOnce 状态机）

**Files:**
- Create: `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.ts`
- Test: `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { ChunkTagQueueService } from './chunk-tag-queue.service';
import { ChunkTagStore } from './chunk-tag-store';
import { ChunkTaggerService } from './chunk-tagger.service';
import { JOB_TIMEOUT_MS } from './chunk-tagger.constants';

describe('ChunkTagQueueService.pollOnce', () => {
  const store = { listPending: vi.fn(), remove: vi.fn(), enqueue: vi.fn() };
  const ragflow = { request: vi.fn() };
  const tagger = { tagDocument: vi.fn() };
  let service: ChunkTagQueueService;

  beforeEach(async () => {
    vi.clearAllMocks();
    store.remove.mockResolvedValue(undefined);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkTagQueueService,
        { provide: ChunkTagStore, useValue: store },
        { provide: RagflowService, useValue: ragflow },
        { provide: ChunkTaggerService, useValue: tagger },
      ],
    }).compile();
    service = moduleRef.get(ChunkTagQueueService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tags a DONE doc then removes it from pending', async () => {
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'DONE' }],
      total: 1,
    });
    tagger.tagDocument.mockResolvedValue({
      totalChunks: 3,
      updated: 3,
      empty: 0,
      failed: 0,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).toHaveBeenCalledWith('ds1', 'd1', 'X.docx');
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('removes a FAIL doc without tagging', async () => {
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'FAIL' }],
      total: 1,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('removes a doc that no longer exists (not in docs list)', async () => {
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({ docs: [], total: 0 });

    await service.pollOnce();

    expect(tagger.tagDocument).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('keeps a RUNNING doc that has not timed out', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS - 1);
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'RUNNING' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).not.toHaveBeenCalled();
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('removes a RUNNING doc that has timed out', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS + 1);
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'RUNNING' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('tags a DONE doc even if its enqueuedAt is very old (timeout ignores DONE)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000 + JOB_TIMEOUT_MS * 10);
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: 'DONE' }],
      total: 1,
    });
    tagger.tagDocument.mockResolvedValue({
      totalChunks: 1,
      updated: 1,
      empty: 0,
      failed: 0,
    });

    await service.pollOnce();

    expect(tagger.tagDocument).toHaveBeenCalledWith('ds1', 'd1', 'X.docx');
    expect(store.remove).toHaveBeenCalledWith('ds1:d1');
  });

  it('keeps a doc with an unknown run value (does not remove)', async () => {
    store.listPending.mockResolvedValue([{ member: 'ds1:d1', enqueuedAt: 1000 }]);
    ragflow.request.mockResolvedValue({
      docs: [{ id: 'd1', name: 'X.docx', run: '5' }],
      total: 1,
    });

    await service.pollOnce();

    expect(store.remove).not.toHaveBeenCalled();
    expect(tagger.tagDocument).not.toHaveBeenCalled();
  });

  it('groups pending by dataset: one GET per dataset', async () => {
    store.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1000 },
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
    ragflow.request.mockResolvedValue({
      docs: [
        { id: 'd1', name: 'A.docx', run: 'FAIL' },
        { id: 'd2', name: 'B.docx', run: 'FAIL' },
      ],
      total: 2,
    });

    await service.pollOnce();

    const getCalls = ragflow.request.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls.length).toBe(1); // 同一 dataset 只列一次
    expect(store.remove).toHaveBeenCalledTimes(2);
  });

  it('reentrancy guard: a second concurrent pollOnce is a no-op', async () => {
    let release: () => void = () => undefined;
    store.listPending.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );
    const first = service.pollOnce();
    const second = service.pollOnce(); // 第一轮未完成
    expect(store.listPending).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });

  it('does not throw when listPending rejects (degrades)', async () => {
    store.listPending.mockRejectedValue(new Error('redis down'));
    await expect(service.pollOnce()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && pnpm exec vitest run src/common/chunk-tagger/chunk-tag-queue.service.spec.ts`
Expected: FAIL —— `Cannot find module './chunk-tag-queue.service'`。

- [ ] **Step 3: 写 `chunk-tag-queue.service.ts`**

创建 `apps/server/src/common/chunk-tagger/chunk-tag-queue.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { ChunkTagStore, type PendingItem } from './chunk-tag-store';
import { JOB_TIMEOUT_MS, POLL_INTERVAL_MS, RUN } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';

interface RagflowDoc {
  id: string;
  name: string;
  run: string;
}

interface ListDocsResponse {
  docs?: RagflowDoc[];
  total?: number;
}

/** 列 documents 的单页大小(单 KB 文档数,一页足够;超出则只覆盖首页,记 warn) */
const DOCS_PAGE_SIZE = 1000;

/**
 * chunk-tag 后台轮询器:`@Interval` 周期触发 `pollOnce()`,对每个待办 doc 按
 * RAGFlow parse 状态决定打 tag / 弃置 / 保留。打 tag 链路任何失败都被 catch
 * 降级,绝不抛回调度器。
 */
@Injectable()
export class ChunkTagQueueService {
  private readonly logger = new Logger(ChunkTagQueueService.name);
  private isPolling = false;

  constructor(
    private readonly store: ChunkTagStore,
    private readonly ragflow: RagflowService,
    private readonly tagger: ChunkTaggerService,
  ) {}

  /** `@Interval` 薄包装:仅触发 pollOnce(重入由 pollOnce 内 isPolling 守卫)。 */
  @Interval(POLL_INTERVAL_MS)
  tick(): void {
    void this.pollOnce();
  }

  /** 轮询一次。可单独 await(测试用)。 */
  async pollOnce(): Promise<void> {
    if (this.isPolling) return; // 单实例重入守卫
    this.isPolling = true;
    try {
      const pending = await this.store.listPending();
      if (pending.length === 0) return;

      const docMaps = await this.loadDocMaps(pending);
      const now = Date.now();
      for (const item of pending) {
        try {
          await this.handlePending(item, docMaps, now);
        } catch (error) {
          // 单 member 失败隔离:保留到下一轮,不中断其余 pending
          this.logger.warn(
            `处理待办 ${item.member} 失败(保留下轮重试):${this.msg(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(`pollOnce 异常(降级,下一轮重试):${this.msg(error)}`);
    } finally {
      this.isPolling = false;
    }
  }

  /** 按 datasetId 分组,每个 dataset 一次 GET documents,建 docId→doc 映射。 */
  private async loadDocMaps(
    pending: PendingItem[],
  ): Promise<Map<string, Map<string, RagflowDoc>>> {
    const datasetIds = new Set(
      pending.map((p) => p.member.split(':')[0]).filter(Boolean),
    );
    const maps = new Map<string, Map<string, RagflowDoc>>();
    for (const datasetId of datasetIds) {
      try {
        const data = await this.ragflow.request<ListDocsResponse>(
          'GET',
          `/api/v1/datasets/${datasetId}/documents`,
          { page: 1, page_size: DOCS_PAGE_SIZE },
        );
        const docs = data.docs ?? [];
        if ((data.total ?? docs.length) > DOCS_PAGE_SIZE) {
          this.logger.warn(
            `dataset ${datasetId} 文档数 ${data.total} 超过单页 ${DOCS_PAGE_SIZE},本轮仅覆盖首页`,
          );
        }
        const byId = new Map<string, RagflowDoc>();
        for (const doc of docs) byId.set(doc.id, doc);
        maps.set(datasetId, byId);
      } catch (error) {
        // 整个 dataset 列举失败(含 102 KB 已删):空映射,handlePending 按"doc 不存在"处理
        this.logger.warn(`列 dataset ${datasetId} documents 失败:${this.msg(error)}`);
        maps.set(datasetId, new Map());
      }
    }
    return maps;
  }

  /** 对单个待办 doc 按 run 状态决策。抛出则由 pollOnce 的 per-member catch 兜住。 */
  private async handlePending(
    { member, enqueuedAt }: PendingItem,
    docMaps: Map<string, Map<string, RagflowDoc>>,
    now: number,
  ): Promise<void> {
    const [datasetId, docId] = member.split(':');
    if (!datasetId || !docId) {
      await this.store.remove(member);
      return;
    }
    const doc = docMaps.get(datasetId)?.get(docId);
    if (!doc) {
      await this.store.remove(member);
      this.logger.warn(`待办 ${member} 对应 doc 不存在,移除`);
      return;
    }
    switch (doc.run) {
      case RUN.DONE: {
        const result = await this.tagger.tagDocument(datasetId, docId, doc.name);
        await this.store.remove(member);
        this.logger.log(
          `已为 ${doc.name} 打 tag:total=${result.totalChunks} updated=${result.updated} failed=${result.failed}`,
        );
        break;
      }
      case RUN.FAIL:
      case RUN.CANCEL: {
        await this.store.remove(member);
        this.logger.warn(`待办 ${member} parse ${doc.run},移除`);
        break;
      }
      case RUN.RUNNING:
      case RUN.UNSTART: {
        if (now - enqueuedAt > JOB_TIMEOUT_MS) {
          await this.store.remove(member);
          this.logger.error(
            `待办 ${member} parse 超过 ${JOB_TIMEOUT_MS}ms 仍未完成,弃置(疑似卡死)`,
          );
        }
        break; // 未超时:保留到下一轮
      }
      default: {
        // 未知 run 值(如 SCHEDULE='5'):保留,不误删
        this.logger.debug(`待办 ${member} 未知 run 值 '${doc.run}',保留`);
        break;
      }
    }
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && pnpm exec vitest run src/common/chunk-tagger/chunk-tag-queue.service.spec.ts`
Expected: PASS(11 用例全绿)。
再 `pnpm -F @sinopec-kb/server typecheck 2>&1 | grep chunk-tagger || echo OK` → 空;`cd apps/server && pnpm exec eslint src/common/chunk-tagger/chunk-tag-queue.service.ts src/common/chunk-tagger/chunk-tag-queue.service.spec.ts` → 无错误。

> 若 eslint 因 `process.env`/`__dirname` 之外的规则(如 `@typescript-eslint/no-unnecessary-condition` 对 `data.docs ?? []`)报 warning,沿用 Plan 1 做法:接口字段标 optional(`docs?`/`total?` 已是)使防御 `?? []` 名正言顺。

- [ ] **Step 5: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tag-queue.service.ts src/common/chunk-tagger/chunk-tag-queue.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add ChunkTagQueueService poll state machine"
```

---

## Task 4: ChunkTaggerModule 接入 store + queue

**Files:**
- Modify: `apps/server/src/common/chunk-tagger/chunk-tagger.module.ts`

- [ ] **Step 1: 更新 module**

把 `chunk-tagger.module.ts` 改为(在 Plan 1 基础上加 `ChunkTagStore` + `ChunkTagQueueService` 到 providers,`ChunkTagStore` 到 exports):

```ts
import { join } from 'node:path';

import { Module } from '@nestjs/common';

import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { ChunkTagQueueService } from './chunk-tag-queue.service';
import { ChunkTagStore } from './chunk-tag-store';
import { KEYWORD_MATCHER, MAX_KEYWORDS } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';
import { createKeywordMatcher } from './keyword-matcher';

// eslint-disable-next-line unicorn/prefer-module
const DATASET_DIR = join(__dirname, 'dataset');

@Module({
  imports: [RagflowModule],
  providers: [
    ChunkTaggerService,
    ChunkTagStore,
    ChunkTagQueueService,
    {
      provide: KEYWORD_MATCHER,
      useFactory: () =>
        createKeywordMatcher(
          join(DATASET_DIR, 'sinopec-concept-dict.csv'),
          join(DATASET_DIR, 'sinopec-regex-catalog.json'),
          MAX_KEYWORDS,
        ),
    },
  ],
  exports: [ChunkTaggerService, ChunkTagStore],
})
export class ChunkTaggerModule {}
```

> `ChunkTagQueueService` 自跑 `@Interval`,无需 export;`ChunkTagStore` export 供 `KnowledgeBaseService` 注入做 enqueue。`CacheModule` 全局,无需 import。

- [ ] **Step 2: 类型检查 + 全量 chunk-tagger 单测 + build**

Run:
```bash
pnpm -F @sinopec-kb/server typecheck 2>&1 | grep chunk-tagger || echo "NO chunk-tagger type errors"
cd apps/server && pnpm exec vitest run src/common/chunk-tagger
cd /root/code/sinopec-knowledge-base && pnpm -F @sinopec-kb/server build
ls -1 apps/server/dist/common/chunk-tagger/dataset/
```
Expected: typecheck 无 chunk-tagger 错;chunk-tagger 全部单测绿(Plan1 19 + store 5 + queue 11 = 35);build 成功;dist dataset 仍含两个字典文件。

- [ ] **Step 3: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tagger.module.ts
git commit -m "feat(@sinopec-kb/server): ✨ wire ChunkTagStore + queue into ChunkTaggerModule"
```

---

## Task 5: parseDocuments 成功后入队 + 单测

**Files:**
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.service.ts`
- Test: `apps/server/src/modules/knowledge-base/knowledge-base.service.spec.ts`(新建)

- [ ] **Step 1: 在 service 注入 `ChunkTagStore` 并改造 `parseDocuments`**

1. 顶部 import 加(与现有 import 风格一致):
```ts
import { ChunkTagStore } from '@/common/chunk-tagger/chunk-tag-store';
```
2. constructor 末尾追加一个注入参数:
```ts
    private readonly chunkTagStore: ChunkTagStore,
```
3. 把 `parseDocuments` 方法体改为(原来直接 `return this.ragflow.request(...)`):
```ts
  async parseDocuments(
    id: number,
    user: ActiveUserData,
    documentIds: string[],
  ) {
    const kb = await this.assertOwnership(id, user);
    const datasetId = this.requireDatasetId(kb);

    const result = await this.ragflow.request(
      'POST',
      `/api/v1/datasets/${datasetId}/chunks`,
      { document_ids: documentIds },
    );
    // 仅 parse 触发成功后入队;入队失败降级为 warn,绝不污染 parse 主流程
    try {
      await this.chunkTagStore.enqueue(datasetId, documentIds);
    } catch (error) {
      this.logger.warn(
        `enqueue chunk-tag 待办失败(降级,可手动回填):${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return result;
  }
```

- [ ] **Step 2: 写单测(新建 spec)**

创建 `apps/server/src/modules/knowledge-base/knowledge-base.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChunkTagStore } from '@/common/chunk-tagger/chunk-tag-store';
import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { DocxPreprocessService } from '@/common/docx-preprocess/docx-preprocess.service';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import { createMockActiveUser } from '@/test-utils/mock.factory';

import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService.parseDocuments', () => {
  const ragflow = { request: vi.fn() };
  const chunkTagStore = { enqueue: vi.fn(), listPending: vi.fn(), remove: vi.fn() };
  const docxPreprocess = {};
  const kbRecord = { id: 1, datasetId: 'ds1', createBy: 'admin', permission: 'me', deptId: null };
  const prisma = {
    client: {
      knowledgeBase: { findUniqueOrThrow: vi.fn() },
      user: { findUniqueOrThrow: vi.fn() },
    },
  };
  let service: KnowledgeBaseService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.client.knowledgeBase.findUniqueOrThrow.mockResolvedValue(kbRecord);
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: 1, isAdmin: true, deptId: null });
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: DocxPreprocessService, useValue: docxPreprocess },
        { provide: ChunkTagStore, useValue: chunkTagStore },
      ],
    }).compile();
    service = moduleRef.get(KnowledgeBaseService);
  });

  it('enqueues documents after a successful parse trigger', async () => {
    ragflow.request.mockResolvedValue({ ok: true });
    chunkTagStore.enqueue.mockResolvedValue(undefined);

    const result = await service.parseDocuments(1, createMockActiveUser(), ['d1', 'd2']);

    expect(ragflow.request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/datasets/ds1/chunks',
      { document_ids: ['d1', 'd2'] },
    );
    expect(chunkTagStore.enqueue).toHaveBeenCalledWith('ds1', ['d1', 'd2']);
    expect(result).toEqual({ ok: true });
  });

  it('does not enqueue and rethrows when the parse trigger fails', async () => {
    ragflow.request.mockRejectedValue(new Error('parse boom'));

    await expect(
      service.parseDocuments(1, createMockActiveUser(), ['d1']),
    ).rejects.toThrow('parse boom');
    expect(chunkTagStore.enqueue).not.toHaveBeenCalled();
  });

  it('still returns the parse result when enqueue fails (degraded)', async () => {
    ragflow.request.mockResolvedValue({ ok: true });
    chunkTagStore.enqueue.mockRejectedValue(new Error('redis down'));

    const result = await service.parseDocuments(1, createMockActiveUser(), ['d1']);

    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: 跑测试 + 类型检查**

Run:
```bash
cd apps/server && pnpm exec vitest run src/modules/knowledge-base/knowledge-base.service.spec.ts
cd /root/code/sinopec-knowledge-base && pnpm -F @sinopec-kb/server typecheck 2>&1 | grep knowledge-base || echo "NO knowledge-base type errors"
```
Expected: 3 用例绿;typecheck 无 knowledge-base 新错误。

> 注:`assertOwnership` 内部对 `kbRecord.createBy === user.username` 等判定;因 mock 的 user `findUniqueOrThrow` 返回 `isAdmin:true`,`assertOwnership` 在 isAdmin 分支直接返回 kb,不触发 owner/dept 判定。

- [ ] **Step 4: Commit**

```bash
cd apps/server
git add src/modules/knowledge-base/knowledge-base.service.ts src/modules/knowledge-base/knowledge-base.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ enqueue chunk-tag after parse trigger"
```

---

## Task 6: 回填 + 状态接口（service + controller + 鉴权单测）

**Files:**
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.service.ts`
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.controller.ts`
- Test: `apps/server/src/modules/knowledge-base/knowledge-base.service.spec.ts`(追加)

- [ ] **Step 1: service 加 `backfillKeywords` + `keywordTagStatus`**

1. 顶部 import 加(`ForbiddenException` 若已 import 则跳过):
```ts
import { ForbiddenException } from '@nestjs/common';
import { RUN } from '@/common/chunk-tagger/chunk-tagger.constants';
```
2. 在类内追加两个方法:
```ts
  /** admin 回填:把该 KB 所有 run===DONE 的存量 doc 入队,轮询器后台统一打 tag。 */
  async backfillKeywords(
    id: number,
    user: ActiveUserData,
  ): Promise<{ enqueued: number; skipped: number }> {
    const kb = await this.assertOwnership(id, user);
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    if (!userData.isAdmin) {
      throw new ForbiddenException('仅管理员可回填关键词');
    }
    const datasetId = this.requireDatasetId(kb);
    const data = await this.ragflow.request<{
      docs?: { id: string; run: string }[];
      total?: number;
    }>('GET', `/api/v1/datasets/${datasetId}/documents`, {
      page: 1,
      page_size: 1000,
    });
    const docs = data.docs ?? [];
    const doneDocIds = docs
      .filter((d) => d.run === RUN.DONE)
      .map((d) => d.id);
    await this.chunkTagStore.enqueue(datasetId, doneDocIds);
    return { enqueued: doneDocIds.length, skipped: docs.length - doneDocIds.length };
  }

  /** admin 只读:该 KB 当前在待办里的 doc 数(自证回填进度)。 */
  async keywordTagStatus(
    id: number,
    user: ActiveUserData,
  ): Promise<{ pendingCount: number }> {
    const kb = await this.assertOwnership(id, user);
    const userData = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    if (!userData.isAdmin) {
      throw new ForbiddenException('仅管理员可查看打 tag 状态');
    }
    const datasetId = this.requireDatasetId(kb);
    const prefix = `${datasetId}:`;
    const pending = await this.chunkTagStore.listPending();
    return {
      pendingCount: pending.filter((p) => p.member.startsWith(prefix)).length,
    };
  }
```

- [ ] **Step 2: controller 加两条路由**

1. 顶部 import 确保有 `Get`、`HttpCode`、`HttpStatus`(从 `@nestjs/common`;若已 import 部分,补齐缺的)。
2. 在 `KnowledgeBaseController` 类内追加(仿 `parseDocuments` 路由风格):
```ts
  @AutoPermission()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/backfill-keywords')
  backfillKeywords(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.knowledgeBaseService.backfillKeywords(id, user);
  }

  @AutoPermission()
  @Get(':id/keyword-tag-status')
  keywordTagStatus(
    @Param('id') id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.knowledgeBaseService.keywordTagStatus(id, user);
  }
```

- [ ] **Step 3: service 鉴权单测(追加到 Task 5 的 spec)**

在 `knowledge-base.service.spec.ts` 追加(复用文件顶部已有的 ragflow/chunkTagStore/prisma mock 与 beforeEach):

```ts
describe('KnowledgeBaseService.backfillKeywords', () => {
  // 复用上方 describe 的 mocks 需提到外层;若上方 mocks 在内层 describe,
  // 则把 ragflow/chunkTagStore/prisma/service 的声明与 beforeEach 提升到文件顶层
  // (一个 describe 包裹),使本 describe 也可见。

  it('enqueues only DONE docs for an admin and returns counts', async () => {
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: 1, isAdmin: true, deptId: null });
    ragflow.request.mockResolvedValue({
      docs: [
        { id: 'd1', run: 'DONE' },
        { id: 'd2', run: 'RUNNING' },
        { id: 'd3', run: 'DONE' },
      ],
      total: 3,
    });
    chunkTagStore.enqueue.mockResolvedValue(undefined);

    const r = await service.backfillKeywords(1, createMockActiveUser());

    expect(chunkTagStore.enqueue).toHaveBeenCalledWith('ds1', ['d1', 'd3']);
    expect(r).toEqual({ enqueued: 2, skipped: 1 });
  });

  it('throws ForbiddenException for a non-admin', async () => {
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: 1, isAdmin: false, deptId: null });

    await expect(
      service.backfillKeywords(1, createMockActiveUser()),
    ).rejects.toThrow('仅管理员可回填关键词');
    expect(chunkTagStore.enqueue).not.toHaveBeenCalled();
  });
});

describe('KnowledgeBaseService.keywordTagStatus', () => {
  it('counts only this dataset pending members for an admin', async () => {
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: 1, isAdmin: true, deptId: null });
    chunkTagStore.listPending.mockResolvedValue([
      { member: 'ds1:d1', enqueuedAt: 1 },
      { member: 'ds1:d2', enqueuedAt: 1 },
      { member: 'ds9:d3', enqueuedAt: 1 },
    ]);

    const r = await service.keywordTagStatus(1, createMockActiveUser());

    expect(r).toEqual({ pendingCount: 2 });
  });

  it('throws ForbiddenException for a non-admin', async () => {
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: 1, isAdmin: false, deptId: null });

    await expect(
      service.keywordTagStatus(1, createMockActiveUser()),
    ).rejects.toThrow('仅管理员可查看打 tag 状态');
  });
});
```

> **重要(避免 Task 5/6 spec 结构冲突)**:Task 5 把 `ragflow`/`chunkTagStore`/`prisma`/`service` 声明 + `beforeEach` 放在最外层文件作用域(一个顶层 `describe` 或直接文件级),使 Task 5 的 `parseDocuments` describe 与 Task 6 的两个 describe **共享同一套 mock 与 beforeEach**。实现 Task 6 时若发现 Task 5 的 mock 在内层 describe,先重构提升到共享作用域再追加。`assertOwnership` 里第一次 `user.findUniqueOrThrow`(取 isAdmin 做 ownership)与 backfill 里第二次(取 isAdmin 做硬约束)用的是同一 mock,`mockResolvedValue` 对两次调用都返回同值,故 admin/非 admin 用例都自洽。

- [ ] **Step 4: 跑测试 + 类型检查 + eslint**

Run:
```bash
cd apps/server && pnpm exec vitest run src/modules/knowledge-base/knowledge-base.service.spec.ts
cd /root/code/sinopec-knowledge-base && pnpm -F @sinopec-kb/server typecheck 2>&1 | grep knowledge-base || echo "NO knowledge-base type errors"
cd apps/server && pnpm exec eslint src/modules/knowledge-base/knowledge-base.service.ts src/modules/knowledge-base/knowledge-base.controller.ts src/modules/knowledge-base/knowledge-base.service.spec.ts
```
Expected: 全部 spec 绿(parse 3 + backfill 2 + status 2 = 7);typecheck 无 knowledge-base 新错误;eslint 无错误。

- [ ] **Step 5: Commit**

```bash
cd apps/server
git add src/modules/knowledge-base/knowledge-base.service.ts src/modules/knowledge-base/knowledge-base.controller.ts src/modules/knowledge-base/knowledge-base.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add admin backfill + keyword-tag-status endpoints"
```

---

## Task 7: KnowledgeBaseModule 接入 ChunkTaggerModule + 全量验证

**Files:**
- Modify: `apps/server/src/modules/knowledge-base/knowledge-base.module.ts`

- [ ] **Step 1: imports 加 `ChunkTaggerModule`**

把 `knowledge-base.module.ts` 的 `imports` 改为(加 `ChunkTaggerModule`,并在顶部 import 它):

```ts
import { ChunkTaggerModule } from '@/common/chunk-tagger/chunk-tagger.module';
```
```ts
  imports: [RagflowModule, DocxPreprocessModule, ChunkTaggerModule],
```

> `ChunkTaggerModule` export 了 `ChunkTagStore`,`KnowledgeBaseService` 注入它才能解析。`ChunkTaggerService`/`ChunkTagQueueService` 也随之实例化,`@Interval` 在 app bootstrap 后开始周期轮询。

- [ ] **Step 2: 全量类型检查 + 全量单测 + build + Nest 启动装配自检**

Run:
```bash
pnpm -F @sinopec-kb/server typecheck 2>&1 | grep -E 'chunk-tagger|knowledge-base' || echo "NO new type errors"
cd apps/server && pnpm exec vitest run src/common/chunk-tagger src/modules/knowledge-base
cd /root/code/sinopec-knowledge-base && pnpm -F @sinopec-kb/server build
```
Expected: typecheck 无 chunk-tagger/knowledge-base 新错误(仅残留 pre-existing `run-via-server.ts:306`);chunk-tagger + knowledge-base 全部单测绿;build 成功。

- [ ] **Step 3: (推荐)用一个最小 e2e/集成跑通 DI 装配**

> Nest 的 DI 装配错误(漏 provider / 循环依赖 / token 不匹配)`build` 抓不到,只在运行时暴露。若项目有 e2e 框架(`test:e2e`),加一个最小用例 `Test.createTestingModule({ imports:[KnowledgeBaseModule] }).compile()` 断言不抛即可证明 `ChunkTagStore`/`ChunkTagQueueService`/`@Interval` 全部能解析。若不便,至少本地 `pnpm -F @sinopec-kb/server build && node dist/main`(或 `pnpm dev:server`)启动一次,确认无 `Nest can't resolve dependencies` 报错后 Ctrl-C。把验证结果记录在 commit 或 PR 描述。

- [ ] **Step 4: Commit**

```bash
cd apps/server
git add src/modules/knowledge-base/knowledge-base.module.ts
git commit -m "feat(@sinopec-kb/server): ✨ wire ChunkTaggerModule into KnowledgeBaseModule"
```

---

## 完成标准（Plan 2，对照 spec §12 验收）

- [ ] 新上传文档 parse 完成后,无需人工,其 chunk 在 RAGFlow 上带 `important_keywords`(全自动路径:enqueue→pollOnce DONE→tagDocument)。
- [ ] admin 调 `POST /api/knowledge-base/:id/backfill-keywords` 入队该 KB 存量 DONE doc;`GET .../keyword-tag-status` 可见待办计数;轮询器后台打完后归零。
- [ ] 非 admin 调回填/状态接口抛 `ForbiddenException`(403)。
- [ ] Redis/cache 不可用时 parse 仍成功(enqueue 失败仅 warn,降级)。
- [ ] 打 tag 链路任何失败不污染 parse 主流程;pollOnce 全程 try-catch 降级,单 member 失败隔离。
- [ ] `pnpm -F @sinopec-kb/server typecheck`(无 chunk-tagger/knowledge-base 新错)、`build`、全量单测通过;新增单测覆盖待办存储幂等、轮询状态机全分支(DONE/FAIL/CANCEL/不存在/超时/未超时/DONE 不受老化/未知值/重入守卫/降级)、parse 入队降级、回填鉴权。

## 已知边界（沿用 spec §8，本期不做）

- **多实例**:`@Interval` + KV read-modify-write 在多实例下有竞态,`isPolling` 仅进程内;当前 sinopec 测试服单实例,`PUT important_keywords` 幂等(覆盖),最坏重复打一次无数据风险。将来多实例需 Redis 原生原子结构或分布式锁。
- **doc/KB 删除不反向清待办**:轮询命中"doc 不存在"自愈移除。
- **单 KB 文档数 > `DOCS_PAGE_SIZE`(1000)**:回填与 pollOnce 的 GET documents 仅覆盖首页并记 warn;超大 KB 需后续加分页。
- **constants 顶层读 env 的时序**(Plan 1 最终 review follow-up #1):本计划把 `ChunkTaggerModule` 接入 `KnowledgeBaseModule` 后,`POLL_INTERVAL_MS`/`JOB_TIMEOUT_MS`/`CONCURRENCY`/`MAX_KEYWORDS` 在 `require` 时即读 `process.env`。本项目 `config.module.ts` 在模块顶层 `dotenvxConfig()` 预加载 `.env`。若这些可选调优参数放真实环境变量(Docker env)则无时序问题;若放 `.env` 文件且 constants 先于 config.module 求值,会用默认值。**执行 Task 4/7 时留意**:如需用 `.env` 配这些值,把 env 读取移进各自的 `useFactory`/provider(而非模块顶层 const)。`@Interval(POLL_INTERVAL_MS)` 是装饰器入参,无法延迟求值——若需运行时可配轮询间隔,改用 `SchedulerRegistry.addInterval` 在 `onApplicationBootstrap` 动态注册(本期默认 30s 固定,不做)。

## Self-Review（writing-plans 自检）

- **Spec 覆盖**:§5.1 tagDocument(Plan 1 已有,被 Task 3 调用)/§5.2 全自动入队(Task 5)/§5.3 pollOnce 状态机(Task 3,含 DONE 优先不受老化、未知值保留、超时仅 RUNNING/UNSTART)/§5.4 回填(Task 6)/§5.5 状态接口(Task 6)/§6 store(Task 2)/§7 常量(Task 1)/§8 边界(Task 3 降级+重入+per-member 隔离)/§9 鉴权(Task 6 service 层 isAdmin 硬约束)/§10 资产(Plan 1 已锁,Task 4 build 复核)/§11 测试(各 Task TDD)。✅
- **占位符扫描**:无 TBD/TODO;每个写代码步骤均含完整代码。✅
- **类型一致**:`PendingItem{member,enqueuedAt}`、`ChunkTagStore.enqueue(datasetId,docIds)/listPending():PendingItem[]/remove(member)`、`RUN`/`RunStatus`、`tagDocument(datasetId,docId,docName)→{totalChunks,updated,empty,failed}`、`backfillKeywords→{enqueued,skipped}`、`keywordTagStatus→{pendingCount}` 跨 Task 一致。✅
- **已知风险**:RUN 文本值已由 RAGFlow 源码(doc.py:627 映射)坐实;Task 5/6 共享 spec mock 作用域需实现时注意(已在 Task 6 Step 3 标注);DI 装配错误 build 抓不到,Task 7 Step 3 用启动自检兜底。
