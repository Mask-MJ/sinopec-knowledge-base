# chunk-tagger Plan 1（核心:纯函数 + 资产 + 单 doc 打 tag)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把评测脚本 `scripts/eval/chunk-tagger.ts` 的领域字典匹配能力工程化为 NestJS `common/chunk-tagger` 模块,产出一个可被直接调用的 `ChunkTaggerService.tagDocument(datasetId, docId, docName)`(给单个 doc 的所有 chunk 写 `important_keywords`)。

**Architecture:** 纯函数(字典/正则匹配、项目归属推断)抽到 `keyword-matcher.ts` 并以 `KEYWORD_MATCHER` token 注入;`ChunkTaggerService` 复用 `RagflowService` 列 chunk(官方 `GET .../chunks`,字段 `id`/`content`)→ 匹配 → 分批并发 `PUT important_keywords`。字典资产迁入 `src` 并由 nest-cli `assets` 打进 dist。**本计划不含**队列/轮询/parse 自动入队/回填接口(那是 Plan 2)。

**Tech Stack:** NestJS + SWC(CommonJS)、vitest、RagflowService(已封装 axios)、手写 `processBatch` 分批并发(p-limit@7 是 ESM-only 与 CommonJS 不兼容,见 spec D5)。

**Spec:** `docs/superpowers/specs/2026-06-06-chunk-tagger-service-design.md`(§13 Plan 1)

---

## 文件结构

- Create: `apps/server/src/common/chunk-tagger/keyword-matcher.ts` — 纯函数:dict/regex 解析与匹配、项目归属推断、`createKeywordMatcher` 工厂
- Create: `apps/server/src/common/chunk-tagger/keyword-matcher.spec.ts` — 纯函数单测(fixture 驱动)
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.constants.ts` — `CONCURRENCY` / `MAX_KEYWORDS` / `KEYWORD_MATCHER` token
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.service.ts` — `ChunkTaggerService.tagDocument`
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.service.spec.ts` — service 单测(mock RagflowService + matcher)
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.module.ts` — wiring
- Move: `apps/server/scripts/eval/dataset/sinopec-concept-dict.csv` → `apps/server/src/common/chunk-tagger/dataset/sinopec-concept-dict.csv`
- Move: `apps/server/scripts/eval/dataset/sinopec-regex-catalog.json` → `apps/server/src/common/chunk-tagger/dataset/sinopec-regex-catalog.json`
- Modify: `apps/server/nest-cli.json` — 加 `assets` 复制字典到 dist
- Modify: `apps/server/scripts/eval/chunk-tagger.ts` — 改 import 复用 common 纯函数(消除漂移)

---

## Task 1: 迁移字典资产 + 配置 nest-cli assets(先锁资产落点)

**Files:**
- Move: `apps/server/scripts/eval/dataset/sinopec-concept-dict.csv` → `apps/server/src/common/chunk-tagger/dataset/sinopec-concept-dict.csv`
- Move: `apps/server/scripts/eval/dataset/sinopec-regex-catalog.json` → `apps/server/src/common/chunk-tagger/dataset/sinopec-regex-catalog.json`
- Modify: `apps/server/nest-cli.json`

- [ ] **Step 1: 用 git mv 迁移字典资产到 src**

```bash
cd apps/server
mkdir -p src/common/chunk-tagger/dataset
git mv scripts/eval/dataset/sinopec-concept-dict.csv src/common/chunk-tagger/dataset/sinopec-concept-dict.csv
git mv scripts/eval/dataset/sinopec-regex-catalog.json src/common/chunk-tagger/dataset/sinopec-regex-catalog.json
```

- [ ] **Step 2: 配置 nest-cli.json assets**

把 `apps/server/nest-cli.json` 改为(在 `compilerOptions` 内加 `assets` + `watchAssets`):

```jsonc
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true,
    "assets": [
      "common/chunk-tagger/dataset/sinopec-concept-dict.csv",
      "common/chunk-tagger/dataset/sinopec-regex-catalog.json"
    ],
    "watchAssets": true,
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "introspectComments": true,
          "classValidatorShim": true
        }
      }
    ],
    "deleteOutDir": true
  }
}
```

> assets 字符串相对 `sourceRoot`(src),复制时保留相对路径到 dist。

- [ ] **Step 3: build 并断言资产落到运行时期望的路径**

Run:
```bash
cd apps/server
pnpm build
ls -1 dist/common/chunk-tagger/dataset/
```
Expected: 输出含 `sinopec-concept-dict.csv` 和 `sinopec-regex-catalog.json`(即落在 `dist/common/chunk-tagger/dataset/`,与运行时 `join(__dirname,'dataset',...)` 一致)。

> 若资产被拍平到 `dist/` 根或多了层级,改用对象形式 `{ "include": "common/chunk-tagger/dataset/*", "outDir": "dist/common/chunk-tagger/dataset" }` 后重跑本步,直到 `ls` 命中正确路径。**写任何业务代码前必须先让这步绿。**

- [ ] **Step 4: Commit**

```bash
cd apps/server
git add nest-cli.json src/common/chunk-tagger/dataset
git commit -m "chore(@sinopec-kb/server): 🔨 move chunk-tagger dataset into src + configure nest assets"
```

---

## Task 2: keyword-matcher 纯函数 + 单测(TDD)

**Files:**
- Create: `apps/server/src/common/chunk-tagger/keyword-matcher.ts`
- Test: `apps/server/src/common/chunk-tagger/keyword-matcher.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/src/common/chunk-tagger/keyword-matcher.spec.ts`:

```ts
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createKeywordMatcher,
  inferProjectKeywords,
  matchChunk,
  parseDict,
  parseRegexCatalog,
} from './keyword-matcher';

describe('parseDict', () => {
  it('parses term,tags csv, skips header, splits multi-tags by ;', () => {
    const dict = parseDict('term,tags\nAGC,数据处理\n微测井,表层调查;静校正\n');
    expect(dict.get('AGC')).toEqual(['数据处理']);
    expect(dict.get('微测井')).toEqual(['表层调查', '静校正']);
    expect(dict.size).toBe(2);
  });

  it('skips blank and tag-less lines', () => {
    const dict = parseDict('term,tags\n\nfoo\nbar,t1');
    expect(dict.has('foo')).toBe(false);
    expect(dict.get('bar')).toEqual(['t1']);
  });
});

describe('parseRegexCatalog', () => {
  it('compiles patterns with global flag and keeps tags', () => {
    const [r] = parseRegexCatalog(
      JSON.stringify([{ name: 'n', pattern: '\\d+m', tags: ['尺寸'] }]),
    );
    expect(r.re.flags).toContain('g');
    expect(r.tags).toEqual(['尺寸']);
    expect('埋深3m'.match(r.re)).toEqual(['3m']);
  });
});

describe('matchChunk', () => {
  const dict = parseDict('term,tags\n微测井,表层调查\n');
  const regexes = parseRegexCatalog(
    JSON.stringify([{ name: 'n', pattern: '\\d+m', tags: ['尺寸'] }]),
  );

  it('collects dict term + tag + regex match text + regex tag', () => {
    const out = matchChunk('用微测井,埋深4m', dict, regexes, 30);
    expect(out).toContain('微测井');
    expect(out).toContain('表层调查');
    expect(out).toContain('4m');
    expect(out).toContain('尺寸');
  });

  it('dedupes and caps at maxKeywords', () => {
    const out = matchChunk('微测井微测井 4m 5m', dict, regexes, 2);
    expect(out.length).toBe(2);
  });

  it('returns empty when nothing matches', () => {
    expect(matchChunk('xyz', dict, regexes, 30)).toEqual([]);
  });
});

describe('inferProjectKeywords', () => {
  it('maps 顺8井北 docName to project keywords', () => {
    expect(inferProjectKeywords('2016年顺8井北三维.docx')).toEqual([
      '顺8井北',
      '顺8井北三维',
    ]);
  });

  it('returns [] for unknown project', () => {
    expect(inferProjectKeywords('未知项目.docx')).toEqual([]);
  });
});

describe('createKeywordMatcher (smoke, real dataset files)', () => {
  it('loads real dataset and returns an array', () => {
    const matcher = createKeywordMatcher(
      join(__dirname, 'dataset', 'sinopec-concept-dict.csv'),
      join(__dirname, 'dataset', 'sinopec-regex-catalog.json'),
      30,
    );
    expect(Array.isArray(matcher.match('AGC'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run src/common/chunk-tagger/keyword-matcher.spec.ts`
Expected: FAIL —— `Cannot find module './keyword-matcher'`。

- [ ] **Step 3: 写 keyword-matcher.ts**

创建 `apps/server/src/common/chunk-tagger/keyword-matcher.ts`:

```ts
// cspell:disable-file
import { readFileSync } from 'node:fs';

export interface RegexPattern {
  name: string;
  pattern: string;
  tags: string[];
}

export interface CompiledRegex {
  name: string;
  re: RegExp;
  tags: string[];
}

export interface KeywordMatcher {
  match(text: string): string[];
}

/** 解析概念字典 CSV(首行 header,`term,tags`;多 tag 用 `;` 分隔) */
export function parseDict(csv: string): Map<string, string[]> {
  const lines = csv.split('\n').slice(1).filter(Boolean);
  const map = new Map<string, string[]>();
  for (const line of lines) {
    const [term, tagStr] = line.split(',');
    if (!term || !tagStr) continue;
    map.set(
      term.trim(),
      tagStr
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  return map;
}

export function loadDict(path: string): Map<string, string[]> {
  return parseDict(readFileSync(path, 'utf8'));
}

/** 解析正则目录 JSON,预编译为全局正则 */
export function parseRegexCatalog(json: string): CompiledRegex[] {
  const arr = JSON.parse(json) as RegexPattern[];
  return arr.map((r) => ({
    name: r.name,
    re: new RegExp(r.pattern, 'g'),
    tags: r.tags ?? [],
  }));
}

export function loadRegex(path: string): CompiledRegex[] {
  return parseRegexCatalog(readFileSync(path, 'utf8'));
}

/** 对一段 chunk 文本匹配关键词(概念字典 substring + 正则 matchAll),cap maxKeywords */
export function matchChunk(
  text: string,
  dict: Map<string, string[]>,
  regexes: CompiledRegex[],
  maxKeywords: number,
): string[] {
  const keywords = new Set<string>();
  const tags = new Set<string>();
  for (const [term, ts] of dict) {
    if (text.includes(term)) {
      keywords.add(term);
      for (const t of ts) tags.add(t);
    }
  }
  for (const { re, tags: rTags } of regexes) {
    const matches = [...text.matchAll(re)].slice(0, 8);
    if (matches.length === 0) continue;
    for (const m of matches) keywords.add(m[0].trim());
    for (const t of rTags) tags.add(t);
  }
  return [...keywords, ...tags].slice(0, maxKeywords);
}

/** 从 doc 文件名推断归属项目(作为强制 important_keyword;未命中返回 []) */
export function inferProjectKeywords(docName: string): string[] {
  const rules: Array<[RegExp, string[]]> = [
    [/顺8井北/, ['顺8井北', '顺8井北三维']],
    [/顺中二期|顺中2期/, ['顺中二期', '顺中2期']],
    [/顺中(?!二期)/, ['顺中', '顺中三维', '顺中一期']],
    [/顺北42井东?/, ['顺北42井东', '顺北42']],
    [/顺北43井东?/, ['顺北43井东', '顺北43']],
    [/顺北21井区?/, ['顺北21', '顺北21井区']],
    [/帅垛西/, ['帅垛西', '帅垛西三维']],
    [/史家堡|草舍/, ['史家堡', '草舍', '史家堡-草舍']],
    [/永安/, ['永安', '永安三维']],
    [/宿南/, ['宿南二维', '宿南']],
    [/张集东/, ['张集东', '张集东三维']],
    [/方山新井/, ['方山新井']],
    [/中21井区?/, ['中21井区', '中21']],
    [/页岩气|彭水/, ['页岩气', '彭水']],
  ];
  for (const [re, kws] of rules) {
    if (re.test(docName)) return kws;
  }
  return [];
}

/** 从字典/正则文件构造一个有状态的 matcher(供 DI 注入) */
export function createKeywordMatcher(
  dictPath: string,
  regexPath: string,
  maxKeywords: number,
): KeywordMatcher {
  const dict = loadDict(dictPath);
  const regexes = loadRegex(regexPath);
  return {
    match: (text: string) => matchChunk(text, dict, regexes, maxKeywords),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run src/common/chunk-tagger/keyword-matcher.spec.ts`
Expected: PASS（全部 describe 绿）。

- [ ] **Step 5: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/keyword-matcher.ts src/common/chunk-tagger/keyword-matcher.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add chunk-tagger keyword-matcher pure functions"
```

---

## Task 3: 常量 + matcher 注入 token

**Files:**
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.constants.ts`

- [ ] **Step 1: 写 constants(Plan 1 仅需这三个;轮询/超时/RUN 枚举留 Plan 2)**

创建 `apps/server/src/common/chunk-tagger/chunk-tagger.constants.ts`:

```ts
/** 单 doc 内 PUT chunk 的分批并发数(processBatch) */
export const CONCURRENCY = Number(process.env.CHUNK_TAG_CONCURRENCY ?? 5);

/** 单 chunk 最多写入的 important_keywords 数 */
export const MAX_KEYWORDS = Number(process.env.CHUNK_TAG_MAX_KEYWORDS ?? 30);

/** KeywordMatcher 的 DI 注入 token */
export const KEYWORD_MATCHER = Symbol('KEYWORD_MATCHER');
```

- [ ] **Step 2: 类型检查通过**

Run: `pnpm -F @sinopec-kb/server check:type`
Expected: PASS（无类型错误）。

- [ ] **Step 3: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tagger.constants.ts
git commit -m "feat(@sinopec-kb/server): ✨ add chunk-tagger constants + matcher token"
```

---

## Task 4: ChunkTaggerService.tagDocument + 单测(TDD)

**Files:**
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.service.ts`
- Test: `apps/server/src/common/chunk-tagger/chunk-tagger.service.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/src/common/chunk-tagger/chunk-tagger.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { KEYWORD_MATCHER } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';

describe('chunkTaggerService.tagDocument', () => {
  const ragflow = { request: vi.fn() };
  const matcher = { match: vi.fn() };
  let service: ChunkTaggerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkTaggerService,
        { provide: RagflowService, useValue: ragflow },
        { provide: KEYWORD_MATCHER, useValue: matcher },
      ],
    }).compile();
    service = moduleRef.get(ChunkTaggerService);
  });

  it('lists chunks, matches, PUTs important_keywords per non-empty chunk', async () => {
    matcher.match.mockReturnValue(['kw1']);
    ragflow.request
      .mockResolvedValueOnce({
        chunks: [
          { id: 'c1', content: 'a' },
          { id: 'c2', content: 'b' },
        ],
        total: 2,
      })
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r).toEqual({ totalChunks: 2, updated: 2, empty: 0, failed: 0 });
    expect(ragflow.request).toHaveBeenCalledTimes(3); // 1 GET + 2 PUT
    expect(ragflow.request).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/datasets/ds1/documents/doc1/chunks/c1',
      { important_keywords: ['kw1'] },
    );
  });

  it('counts empty when no keyword matched and no project keyword', async () => {
    matcher.match.mockReturnValue([]);
    ragflow.request.mockResolvedValueOnce({
      chunks: [{ id: 'c1', content: 'a' }],
      total: 1,
    });

    const r = await service.tagDocument('ds1', 'doc1', '未知.docx');

    expect(r).toEqual({ totalChunks: 1, updated: 0, empty: 1, failed: 0 });
    expect(ragflow.request).toHaveBeenCalledTimes(1); // only GET, no PUT
  });

  it('injects project keywords even when matcher returns empty', async () => {
    matcher.match.mockReturnValue([]);
    ragflow.request
      .mockResolvedValueOnce({ chunks: [{ id: 'c1', content: 'a' }], total: 1 })
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', '顺8井北.docx');

    expect(r.updated).toBe(1);
    expect(ragflow.request).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/datasets/ds1/documents/doc1/chunks/c1',
      { important_keywords: ['顺8井北', '顺8井北三维'] },
    );
  });

  it('counts failed when a PUT rejects, without aborting siblings', async () => {
    matcher.match.mockReturnValue(['kw']);
    ragflow.request
      .mockResolvedValueOnce({
        chunks: [
          { id: 'c1', content: 'a' },
          { id: 'c2', content: 'b' },
        ],
        total: 2,
      })
      .mockRejectedValueOnce(new Error('PUT c1 boom'))
      .mockResolvedValueOnce({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r).toEqual({ totalChunks: 2, updated: 1, empty: 0, failed: 1 });
  });

  it('paginates until total reached', async () => {
    matcher.match.mockReturnValue(['k']);
    const page1 = {
      chunks: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, content: 'x' })),
      total: 150,
    };
    const page2 = {
      chunks: Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, content: 'x' })),
      total: 150,
    };
    ragflow.request
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValue({});

    const r = await service.tagDocument('ds1', 'doc1', 'X.docx');

    expect(r.totalChunks).toBe(150);
    const getCalls = ragflow.request.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls.length).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run src/common/chunk-tagger/chunk-tagger.service.spec.ts`
Expected: FAIL —— `Cannot find module './chunk-tagger.service'`。

- [ ] **Step 3: 写 chunk-tagger.service.ts**

创建 `apps/server/src/common/chunk-tagger/chunk-tagger.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { CONCURRENCY, KEYWORD_MATCHER, MAX_KEYWORDS } from './chunk-tagger.constants';
import { type KeywordMatcher, inferProjectKeywords } from './keyword-matcher';

interface RagflowChunk {
  id: string;
  content: string;
}

interface ListChunksResponse {
  chunks: RagflowChunk[];
  total: number;
}

export interface TagDocumentResult {
  totalChunks: number;
  updated: number;
  empty: number;
  failed: number;
}

const PAGE_SIZE = 100;

@Injectable()
export class ChunkTaggerService {
  private readonly logger = new Logger(ChunkTaggerService.name);

  constructor(
    private readonly ragflow: RagflowService,
    @Inject(KEYWORD_MATCHER) private readonly matcher: KeywordMatcher,
  ) {}

  /** 给单个 doc 的所有 chunk 写入 important_keywords。全自动与回填共用。 */
  async tagDocument(
    datasetId: string,
    docId: string,
    docName: string,
  ): Promise<TagDocumentResult> {
    const chunks = await this.listChunks(datasetId, docId);
    const projectKws = inferProjectKeywords(docName);
    const result: TagDocumentResult = {
      totalChunks: chunks.length,
      updated: 0,
      empty: 0,
      failed: 0,
    };

    await this.processBatch(chunks, CONCURRENCY, async (chunk) => {
      const matched = this.matcher.match(chunk.content ?? '');
      const kws = [...new Set([...projectKws, ...matched])].slice(0, MAX_KEYWORDS);
      if (kws.length === 0) {
        result.empty++;
        return;
      }
      try {
        await this.ragflow.request(
          'PUT',
          `/api/v1/datasets/${datasetId}/documents/${docId}/chunks/${chunk.id}`,
          { important_keywords: kws },
        );
        result.updated++;
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `PUT chunk ${chunk.id} 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    this.logger.log(
      `tagDocument ${docName}: total=${result.totalChunks} updated=${result.updated} empty=${result.empty} failed=${result.failed}`,
    );
    return result;
  }

  private async listChunks(
    datasetId: string,
    docId: string,
  ): Promise<RagflowChunk[]> {
    const all: RagflowChunk[] = [];
    for (let page = 1; page < 1000; page++) {
      const data = await this.ragflow.request<ListChunksResponse>(
        'GET',
        `/api/v1/datasets/${datasetId}/documents/${docId}/chunks`,
        { page, page_size: PAGE_SIZE },
      );
      const chunks = data?.chunks ?? [];
      all.push(...chunks);
      if (chunks.length < PAGE_SIZE || all.length >= (data?.total ?? all.length)) {
        break;
      }
    }
    return all;
  }

  private async processBatch<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
      await Promise.all(items.slice(i, i + concurrency).map((item) => fn(item)));
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run src/common/chunk-tagger/chunk-tagger.service.spec.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tagger.service.ts src/common/chunk-tagger/chunk-tagger.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add ChunkTaggerService.tagDocument"
```

---

## Task 5: ChunkTaggerModule wiring

**Files:**
- Create: `apps/server/src/common/chunk-tagger/chunk-tagger.module.ts`

- [ ] **Step 1: 写 module**

创建 `apps/server/src/common/chunk-tagger/chunk-tagger.module.ts`:

```ts
import { join } from 'node:path';

import { Module } from '@nestjs/common';

import { RagflowModule } from '@/common/ragflow/ragflow.module';

import { KEYWORD_MATCHER, MAX_KEYWORDS } from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';
import { createKeywordMatcher } from './keyword-matcher';

const DATASET_DIR = join(__dirname, 'dataset');

@Module({
  imports: [RagflowModule],
  providers: [
    ChunkTaggerService,
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
  exports: [ChunkTaggerService],
})
export class ChunkTaggerModule {}
```

- [ ] **Step 2: 类型检查 + 全量单测 + build 均通过**

Run:
```bash
pnpm -F @sinopec-kb/server check:type
pnpm -F @sinopec-kb/server vitest run src/common/chunk-tagger
pnpm -F @sinopec-kb/server build
```
Expected: 三条全部 PASS（类型 0 错;chunk-tagger 全部用例绿;build 成功且 `dist/common/chunk-tagger/dataset/` 仍含两个字典文件)。

- [ ] **Step 3: Commit**

```bash
cd apps/server
git add src/common/chunk-tagger/chunk-tagger.module.ts
git commit -m "feat(@sinopec-kb/server): ✨ wire ChunkTaggerModule"
```

---

## Task 6: eval 脚本复用 common 纯函数(消除字典/匹配逻辑漂移)

**Files:**
- Modify: `apps/server/scripts/eval/chunk-tagger.ts`

> 现在 `scripts/eval/chunk-tagger.ts` 自带 `loadDict`/`loadRegex`/`matchChunk`/`inferProjectKeywords` 与 dataset 默认路径,迁移后这些定义重复且 dataset 路径已失效。改为复用 `common/chunk-tagger/keyword-matcher` 的同名函数,dataset 默认路径指向新位置。

- [ ] **Step 1: 删除脚本内重复纯函数,改为 import common 实现**

在 `apps/server/scripts/eval/chunk-tagger.ts`:

1. 删除文件内这些**本地定义**:`interface RegexPattern`、`interface CompiledRegex`、`function loadDict`、`function loadRegex`、`function matchChunk`、`function inferProjectKeywords`。
2. 在顶部 import 区加入(路径相对 `scripts/eval/` → `src/common/chunk-tagger/`):

```ts
import {
  inferProjectKeywords,
  loadDict,
  loadRegex,
  matchChunk,
} from '../../src/common/chunk-tagger/keyword-matcher';
```

3. 把 `parseArgs` 里 dataset 默认路径改指向新位置:

```ts
const defaults: CliArgs = {
  kb: '',
  dictPath: resolve(
    __dirname,
    '../../src/common/chunk-tagger/dataset',
    'sinopec-concept-dict.csv',
  ),
  regexPath: resolve(
    __dirname,
    '../../src/common/chunk-tagger/dataset',
    'sinopec-regex-catalog.json',
  ),
  maxKeywords: 30,
  concurrency: 5,
};
```

> 脚本仍保留自己的 `processBatch` / `listChunks`(内部 `/v1/chunk/list`)/ `listDocs` / `main`，仅复用纯函数与字典路径。

- [ ] **Step 2: 验证脚本 import 链路正常(无参数应打印 usage 并退出)**

Run:
```bash
cd apps/server
pnpm exec tsx scripts/eval/chunk-tagger.ts 2>&1 | head -3
```
Expected: 打印以 `Usage: tsx chunk-tagger.ts --kb` 开头的用法说明并退出码 1（证明 import 解析成功、未因缺失模块报错）。

- [ ] **Step 3: 类型检查通过**

Run: `pnpm -F @sinopec-kb/server check:type`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd apps/server
git add scripts/eval/chunk-tagger.ts
git commit -m "refactor(@sinopec-kb/server): ♻️ eval chunk-tagger reuses common keyword-matcher"
```

---

## 完成标准(Plan 1)

- [ ] `dist/common/chunk-tagger/dataset/` 含两个字典文件(资产打包正确)
- [ ] `ChunkTaggerService.tagDocument` 可注入、单测全绿(字段映射 content/id、分页、empty/failed/project-kw 注入)
- [ ] `keyword-matcher` 纯函数单测全绿(fixture 驱动,不依赖真实词条)
- [ ] eval 脚本复用 common 纯函数,无重复定义,import 链路正常
- [ ] `pnpm -F @sinopec-kb/server check:type` 与 `build` 通过

> Plan 2 衔接:`ChunkTagStore`(cache-manager 待办)+ `pollOnce` 轮询状态机 + `parseDocuments` 成功后入队 + admin 回填接口 + 只读状态接口,复用本计划产出的 `ChunkTaggerService.tagDocument`。
