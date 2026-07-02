# 检索回放工具(retrieval-replay)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/server/scripts/eval/` 加一个独立只读脚本,对指定题目 dump 出 RAGFlow 召回的 top-k chunk 完整证据(原文/来源/important_keywords/三分/高亮),渲染成带 top_n 截断线与 gold 标注的逐题 markdown,用于定位评测文档 §3 的失败题是「没召回 / 召回排线外 / 召回对文档错段」。

**Architecture:** 纯函数库 `retrieval-replay.lib.ts`(可单测)+ 主脚本 `retrieval-replay.ts`(IO 编排,与 `run.ts` 平行、零侵入)。复用现有 config 格式、题集、`scoring.ts` 纯函数、`.env.eval` 与 `PROD_BLACKLIST` 保护。详见 [spec](../specs/2026-06-16-retrieval-replay-design.md)。

**Tech Stack:** TypeScript + tsx + vitest + p-limit + Node fetch;运行经 `dotenvx run --env-file=.env.eval`。

---

## File Structure

- Create: `apps/server/scripts/eval/retrieval-replay.lib.ts` — 纯函数(无 IO/无时钟)。
- Create: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts` — vitest 单测。
- Create: `apps/server/scripts/eval/retrieval-replay.ts` — 主脚本(arg/env/api/编排/写盘)。
- Reuse (no edit): `apps/server/scripts/eval/scoring.ts`(`normalizeDocName`/`scoreRetrieval`/类型),`configs/*.json`,`dataset/questions*.json`,`.env.eval`。

**约定**:运行测试 `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts`(从 repo 根目录)。新文件顶部统一加:

```ts
/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, unicorn/no-process-exit, turbo/no-undeclared-env-vars */
// cspell:disable-file
```

提交统一用 `test(@sinopec-kb/server): ✅ <subject>`(eval 工具家族,非 version-impacting,无需 changeset)。

---

### Task 1: lib 骨架 + `parseIdList`

**Files:**

- Create: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`:

```ts
// cspell:disable-file
import { describe, expect, it } from 'vitest';

import { parseIdList } from './retrieval-replay.lib';

describe('parseIdList', () => {
  it('parses a csv of ids', () => {
    expect(parseIdList('6,14,18')).toEqual([6, 14, 18]);
  });
  it('trims spaces and drops empties', () => {
    expect(parseIdList(' 4, 8 ,,19 ')).toEqual([4, 8, 19]);
  });
  it('drops non-integer tokens', () => {
    expect(parseIdList('1,foo,3')).toEqual([1, 3]);
  });
  it('returns [] for empty string', () => {
    expect(parseIdList('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — cannot find module `./retrieval-replay.lib` (or `parseIdList` is not a function).

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/scripts/eval/retrieval-replay.lib.ts`:

```ts
/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, unicorn/no-process-exit, turbo/no-undeclared-env-vars */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，file-level disable 说明见 run.ts。

export function parseIdList(csv: string): number[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add retrieval-replay lib skeleton + parseIdList"
```

---

### Task 2: `buildReplayBody`

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```ts
import { buildReplayBody } from './retrieval-replay.lib';

describe('buildReplayBody', () => {
  it('fills defaults and sets page_size=k, highlight=true', () => {
    const body = buildReplayBody('q?', ['ds1'], {}, 30);
    expect(body).toMatchObject({
      question: 'q?',
      dataset_ids: ['ds1'],
      top_k: 1024,
      similarity_threshold: 0.2,
      vector_similarity_weight: 0.3,
      keyword: false,
      page: 1,
      page_size: 30,
      highlight: true,
    });
    expect(body.rerank_id).toBeUndefined();
  });
  it('honors provided retrieval params and rerankId', () => {
    const body = buildReplayBody(
      'q?',
      ['ds1'],
      {
        topK: 256,
        similarityThreshold: 0.35,
        vectorSimilarityWeight: 0.5,
        keyword: true,
        rerankId: 'rk1',
      },
      10,
    );
    expect(body).toMatchObject({
      top_k: 256,
      similarity_threshold: 0.35,
      vector_similarity_weight: 0.5,
      keyword: true,
      page_size: 10,
      rerank_id: 'rk1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — `buildReplayBody` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `retrieval-replay.lib.ts`:

```ts
export interface ReplayRetrievalParams {
  keyword?: boolean;
  rerankId?: string;
  similarityThreshold?: number;
  topK?: number;
  topN?: number;
  vectorSimilarityWeight?: number;
}

export function buildReplayBody(
  question: string,
  datasetIds: string[],
  retrieval: ReplayRetrievalParams,
  k: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    question,
    dataset_ids: datasetIds,
    top_k: retrieval.topK ?? 1024,
    similarity_threshold: retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: retrieval.vectorSimilarityWeight ?? 0.3,
    keyword: retrieval.keyword ?? false,
    page: 1,
    page_size: k,
    highlight: true,
  };
  if (retrieval.rerankId) body.rerank_id = retrieval.rerankId;
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add buildReplayBody"
```

---

### Task 3: `mapChunk`(完整保留 chunk + 字段别名兜底)

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```ts
import { mapChunk } from './retrieval-replay.lib';

describe('mapChunk', () => {
  it('keeps content, keywords, scores; rank = index + 1', () => {
    const raw = {
      content: 'hello',
      document_keyword: 'docA.docx',
      important_keywords: ['kw1', 'kw2'],
      similarity: 0.57,
      vector_similarity: 0.73,
      term_similarity: 0.5,
      positions: [1, 2],
    };
    expect(mapChunk(raw, 0)).toEqual({
      rank: 1,
      documentName: 'docA.docx',
      content: 'hello',
      importantKeywords: ['kw1', 'kw2'],
      similarity: 0.57,
      vectorSimilarity: 0.73,
      termSimilarity: 0.5,
      positions: [1, 2],
    });
  });
  it('falls back across field name aliases', () => {
    const raw = {
      docnm_kwd: 'docB',
      content_with_weight: 'w',
      important_kwd: ['k'],
    };
    const c = mapChunk(raw, 4);
    expect(c.rank).toBe(5);
    expect(c.documentName).toBe('docB');
    expect(c.content).toBe('w');
    expect(c.importantKeywords).toEqual(['k']);
  });
  it('defaults missing fields to empty', () => {
    const c = mapChunk({}, 0);
    expect(c.documentName).toBe('');
    expect(c.content).toBe('');
    expect(c.importantKeywords).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — `mapChunk` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `retrieval-replay.lib.ts`:

```ts
export interface ReplayChunk {
  content: string;
  documentName: string;
  importantKeywords: string[];
  positions?: number[];
  rank: number;
  similarity?: number;
  termSimilarity?: number;
  vectorSimilarity?: number;
}

export function mapChunk(raw: Record<string, any>, index: number): ReplayChunk {
  const kw = raw.important_keywords ?? raw.important_kwd ?? [];
  return {
    rank: index + 1,
    documentName:
      raw.document_keyword ?? raw.document_name ?? raw.docnm_kwd ?? '',
    content: raw.content ?? raw.content_with_weight ?? '',
    importantKeywords: Array.isArray(kw) ? kw.filter(Boolean) : [],
    similarity: raw.similarity,
    vectorSimilarity: raw.vector_similarity,
    termSimilarity: raw.term_similarity,
    positions: raw.positions,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add mapChunk with field-alias fallback"
```

---

### Task 4: `truncateContent` + `isGoldDoc`

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```ts
import { isGoldDoc, truncateContent } from './retrieval-replay.lib';

describe('truncateContent', () => {
  it('collapses whitespace/newlines and keeps short text', () => {
    expect(truncateContent('a\n b\tc')).toBe('a b c');
  });
  it('truncates with ellipsis at max', () => {
    expect(truncateContent('abcdef', 3)).toBe('abc…');
  });
});

describe('isGoldDoc', () => {
  it('matches via normalized containment (extension/space-insensitive)', () => {
    expect(
      isGoldDoc('2022 顺北43 总结报告_noimg.docx', '2022顺北43总结报告'),
    ).toBe(true);
  });
  it('returns false for unrelated docs', () => {
    expect(isGoldDoc('页岩气采集报告', '顺北43总结报告')).toBe(false);
  });
  it('returns false when either side empty', () => {
    expect(isGoldDoc('', 'x')).toBe(false);
    expect(isGoldDoc('x', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — `truncateContent` / `isGoldDoc` not exported.

- [ ] **Step 3: Write minimal implementation**

Add the `scoring` import at the top of `retrieval-replay.lib.ts` (just below the existing comment header):

```ts
import { normalizeDocName } from './scoring';
```

Append the functions:

```ts
export function truncateContent(text: string, max = 200): string {
  const flat = text.replaceAll(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

export function isGoldDoc(documentName: string, refDoc: string): boolean {
  if (!refDoc || !documentName) return false;
  const cand = normalizeDocName(documentName);
  const ref = normalizeDocName(refDoc);
  if (!cand || !ref) return false;
  return cand.includes(ref) || ref.includes(cand);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add truncateContent + isGoldDoc"
```

---

### Task 5: `aggregateDocs`

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```ts
import { aggregateDocs } from './retrieval-replay.lib';
import type { ReplayChunk } from './retrieval-replay.lib';

const chunk = (rank: number, documentName: string): ReplayChunk => ({
  rank,
  documentName,
  content: '',
  importantKeywords: [],
});

describe('aggregateDocs', () => {
  it('counts per document, sorted desc by count', () => {
    const chunks = [chunk(1, 'A'), chunk(2, 'B'), chunk(3, 'A'), chunk(4, 'A')];
    expect(aggregateDocs(chunks)).toEqual([
      { doc: 'A', count: 3 },
      { doc: 'B', count: 1 },
    ]);
  });
  it('returns [] for no chunks', () => {
    expect(aggregateDocs([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — `aggregateDocs` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `retrieval-replay.lib.ts`:

```ts
export function aggregateDocs(
  chunks: ReplayChunk[],
): { count: number; doc: string }[] {
  const m = new Map<string, number>();
  for (const c of chunks)
    m.set(c.documentName, (m.get(c.documentName) ?? 0) + 1);
  return [...m.entries()]
    .map(([doc, count]) => ({ doc, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add aggregateDocs"
```

---

### Task 6: `renderQuestionSection` + `renderReport`

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.lib.ts`
- Test: `apps/server/scripts/eval/retrieval-replay.lib.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```ts
import { renderQuestionSection, renderReport } from './retrieval-replay.lib';

const ref = { doc: '顺北43总结报告', section: '2.1 起止日期' };

describe('renderQuestionSection', () => {
  it('renders table, gold mark, and top_n cut line after row N', () => {
    const chunks: ReplayChunk[] = [
      {
        rank: 1,
        documentName: '页岩气报告',
        content: 'x',
        importantKeywords: [],
        similarity: 0.4,
        vectorSimilarity: 0.4,
        termSimilarity: 0.4,
      },
      {
        rank: 2,
        documentName: '顺北43总结报告',
        content: 'y',
        importantKeywords: ['起止日期'],
        similarity: 0.5,
        vectorSimilarity: 0.5,
        termSimilarity: 0.5,
      },
      {
        rank: 3,
        documentName: '其它',
        content: 'z',
        importantKeywords: [],
        similarity: 0.3,
        vectorSimilarity: 0.3,
        termSimilarity: 0.3,
      },
    ];
    const md = renderQuestionSection({
      qid: 14,
      topic: 'shunbei43',
      question: 'q?',
      reference: ref,
      chunks,
      topN: 2,
    });
    expect(md).toContain('## Q14');
    expect(md).toContain('| # | sim | vec | term |');
    expect(md).toMatch(/top_n=2 截断线/);
    // gold doc row marked
    expect(md).toMatch(/顺北43总结报告.*✅/);
    // doc_aggs footer present
    expect(md).toContain('doc_aggs');
  });
  it('renders error branch without table', () => {
    const md = renderQuestionSection({
      qid: 6,
      topic: 't',
      question: 'q',
      reference: ref,
      chunks: [],
      topN: 10,
      error: 'boom',
    });
    expect(md).toContain('⚠ 检索失败:boom');
    expect(md).not.toContain('| # | sim');
  });
  it('renders empty-recall branch', () => {
    const md = renderQuestionSection({
      qid: 6,
      topic: 't',
      question: 'q',
      reference: ref,
      chunks: [],
      topN: 10,
    });
    expect(md).toContain('（无召回结果）');
  });
});

describe('renderReport', () => {
  it('includes header, params, and sections', () => {
    const md = renderReport(
      {
        experimentId: 'exp1',
        generatedAt: '2026-06-16T00:00:00Z',
        retrieval: { topN: 10 },
        ids: [6, 14],
        k: 30,
      },
      ['## Q6 body', '## Q14 body'],
    );
    expect(md).toContain('# 检索回放:exp1');
    expect(md).toContain('Generated: 2026-06-16T00:00:00Z');
    expect(md).toContain('"topN": 10');
    expect(md).toContain('## Q6 body');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: FAIL — `renderQuestionSection` / `renderReport` not exported.

- [ ] **Step 3: Write minimal implementation**

Add the `scoreRetrieval` + types import — update the existing scoring import line in `retrieval-replay.lib.ts` to:

```ts
import { normalizeDocName, scoreRetrieval } from './scoring';
import type { QuestionRef } from './scoring';
```

Append:

````ts
export interface QuestionSectionInput {
  chunks: ReplayChunk[];
  error?: string;
  qid: number;
  question: string;
  reference: QuestionRef;
  topic: string;
  topN: number;
}

function fmt(n?: number): string {
  return typeof n === 'number' ? n.toFixed(2) : '-';
}

function renderChunkRow(c: ReplayChunk, refDoc: string): string {
  const gold = isGoldDoc(c.documentName, refDoc) ? '✅' : '';
  const kw = c.importantKeywords.slice(0, 6).join(',');
  return `| ${c.rank} | ${fmt(c.similarity)} | ${fmt(c.vectorSimilarity)} | ${fmt(c.termSimilarity)} | ${c.documentName} | ${gold} | ${kw} | ${truncateContent(c.content)} |`;
}

export function renderQuestionSection(input: QuestionSectionInput): string {
  const { chunks, error, qid, question, reference, topic, topN } = input;
  const lines: string[] = [];
  lines.push(`## Q${qid} · ${topic}`, '');
  lines.push(`**问题**:${question}`, '');
  lines.push(
    `**Gold**:doc=${reference.doc || '(无)'} | section=${reference.section || '(无)'}`,
    '',
  );

  if (error) {
    lines.push(`⚠ 检索失败:${error}`, '');
    return lines.join('\n');
  }
  if (chunks.length === 0) {
    lines.push('（无召回结果）', '');
    return lines.join('\n');
  }

  const score = scoreRetrieval(
    chunks.map((c) => ({ documentName: c.documentName })),
    reference,
  );
  lines.push(
    `**文档级命中**:matched=${score.matched} rank=${score.rank} hit@1=${score.hitAt1} hit@3=${score.hitAt3} MRR=${score.mrr.toFixed(2)}`,
    '',
  );
  lines.push(
    '| # | sim | vec | term | 来源文档 | gold? | important_keywords | content 摘要 |',
    '|---|-----|-----|------|----------|-------|--------------------|-------------|',
  );
  for (const c of chunks) {
    lines.push(renderChunkRow(c, reference.doc));
    if (c.rank === topN && chunks.length > topN) {
      lines.push(
        `| — | — | — | — | ─── top_n=${topN} 截断线(以下不进 LLM)─── | — | — | — |`,
      );
    }
  }
  const aggs = aggregateDocs(chunks);
  lines.push(
    '',
    `**doc_aggs**:${aggs.map((a) => `${a.doc}×${a.count}`).join(' / ')}`,
    '',
  );
  return lines.join('\n');
}

export interface ReportMeta {
  experimentId: string;
  generatedAt: string;
  ids: number[];
  k: number;
  retrieval: ReplayRetrievalParams;
}

export function renderReport(meta: ReportMeta, sections: string[]): string {
  const head: string[] = [];
  head.push(`# 检索回放:${meta.experimentId}`, '');
  head.push(`Generated: ${meta.generatedAt}`, '');
  head.push(
    `Question ids: ${meta.ids.join(', ')}  |  k(page_size): ${meta.k}`,
    '',
  );
  head.push(
    '## 检索参数',
    '```json',
    JSON.stringify(meta.retrieval, null, 2),
    '```',
    '',
  );
  return `${head.join('\n')}\n${sections.join('\n')}\n`;
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/retrieval-replay.lib.spec.ts` Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.lib.ts apps/server/scripts/eval/retrieval-replay.lib.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add renderQuestionSection + renderReport"
```

---

### Task 7: 主脚本 `retrieval-replay.ts`(IO 编排)

**Files:**

- Create: `apps/server/scripts/eval/retrieval-replay.ts`

> 该脚本是 IO 编排(fetch/读盘/写盘/process),不做单测;由 Task 8 端到端验证。

- [ ] **Step 1: Create the script**

Create `apps/server/scripts/eval/retrieval-replay.ts`:

```ts
/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, unicorn/no-process-exit, turbo/no-undeclared-env-vars */
// cspell:disable-file
/**
 * 检索回放(只读 dump)：对指定题目拉 top-k chunk 完整证据，渲染成 markdown。
 * 用法: dotenvx run --env-file=.env.eval -- tsx scripts/eval/retrieval-replay.ts \
 *         --config <path> [--ids 6,14,18] [--k 30]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pLimit from 'p-limit';

import {
  buildReplayBody,
  mapChunk,
  parseIdList,
  renderQuestionSection,
  renderReport,
} from './retrieval-replay.lib';
import type {
  ReplayChunk,
  ReplayRetrievalParams,
} from './retrieval-replay.lib';
import type { QuestionRef } from './scoring';

interface ExperimentConfig {
  dataset?: string;
  datasetIds: string[];
  experimentId: string;
  retrieval: ReplayRetrievalParams;
  split?: 'all' | 'dev' | 'holdout';
}

interface QuestionRow {
  id: number;
  question: string;
  reference: QuestionRef;
  topic: string;
}

interface QuestionSet {
  questions: QuestionRow[];
  splits: { dev: number[]; holdout: number[] };
}

const HOST = process.env.RAGFLOW_HOST ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';
const PROD_BLACKLIST = (process.env.RAGFLOW_PROD_KEY_BLACKLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(HOST + path, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok)
    throw new Error(
      `${method} ${path} HTTP ${r.status}: ${text.slice(0, 200)}`,
    );
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} non-JSON: ${text.slice(0, 200)}`);
  }
  if (j.code !== 0)
    throw new Error(`${method} ${path} code=${j.code}: ${j.message ?? ''}`);
  return j.data as T;
}

function parseArgs(argv: string[]) {
  let configPath = '';
  let ids: number[] | undefined;
  let k = 30;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') configPath = argv[++i] ?? '';
    else if (a === '--ids') ids = parseIdList(argv[++i] ?? '');
    else if (a === '--k') k = Number.parseInt(argv[++i] ?? '30', 10);
  }
  if (!configPath) {
    console.error(
      'Usage: tsx retrieval-replay.ts --config <path> [--ids 6,14,18] [--k 30]',
    );
    process.exit(1);
  }
  return { configPath, ids, k };
}

async function callRetrievalFull(
  question: string,
  cfg: ExperimentConfig,
  k: number,
): Promise<ReplayChunk[]> {
  const body = buildReplayBody(question, cfg.datasetIds, cfg.retrieval, k);
  const data = await api<{ chunks?: any[] }>('POST', '/api/v1/retrieval', body);
  return (data.chunks ?? []).map((c, i) => mapChunk(c, i));
}

async function main(): Promise<void> {
  if (!HOST || !API_KEY) {
    console.error('RAGFLOW_HOST / RAGFLOW_API_KEY required');
    process.exit(1);
  }
  if (PROD_BLACKLIST.includes(API_KEY)) {
    console.error('Refusing to run with blacklisted (production) API key');
    process.exit(1);
  }

  const { configPath, ids, k } = parseArgs(process.argv.slice(2));
  const cfg: ExperimentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const datasetFile = cfg.dataset ?? 'questions.json';
  const set: QuestionSet = JSON.parse(
    readFileSync(resolve(__dirname, 'dataset', datasetFile), 'utf8'),
  );

  const split = cfg.split ?? 'all';
  const selectedIds =
    ids ??
    (split === 'all' ? set.questions.map((q) => q.id) : set.splits[split]);

  const known = new Set(set.questions.map((q) => q.id));
  const missing = selectedIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    console.error(
      `Unknown question ids in ${datasetFile}: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
  const questions = set.questions.filter((q) => selectedIds.includes(q.id));

  const outputDir = resolve(__dirname, 'results', `${cfg.experimentId}-replay`);
  mkdirSync(outputDir, { recursive: true });

  console.log(
    `\nReplay: ${cfg.experimentId}  dataset=${datasetFile}  ids=${selectedIds.join(',')}  k=${k}`,
  );
  console.log(`Host: ...${HOST.slice(-25)}  Key: ...${API_KEY.slice(-4)}\n`);

  const topN = cfg.retrieval.topN ?? 10;
  const limit = pLimit(3);
  const sections = await Promise.all(
    questions.map((q) =>
      limit(async () => {
        try {
          const chunks = await callRetrievalFull(q.question, cfg, k);
          console.log(`  ✓ Q${q.id} chunks=${chunks.length}`);
          return renderQuestionSection({
            qid: q.id,
            topic: q.topic,
            question: q.question,
            reference: q.reference,
            chunks,
            topN,
          });
        } catch (error) {
          console.error(`  ✗ Q${q.id} ERROR:`, (error as Error).message);
          return renderQuestionSection({
            qid: q.id,
            topic: q.topic,
            question: q.question,
            reference: q.reference,
            chunks: [],
            topN,
            error: (error as Error).message,
          });
        }
      }),
    ),
  );

  const report = renderReport(
    {
      experimentId: cfg.experimentId,
      generatedAt: new Date().toISOString(),
      retrieval: cfg.retrieval,
      ids: selectedIds,
      k,
    },
    sections,
  );
  const outPath = resolve(outputDir, 'replay.md');
  writeFileSync(outPath, report);
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck the new files**

Run: `pnpm -F @sinopec-kb/server typecheck` Expected: PASS (no errors referencing `retrieval-replay*`). If the project typecheck excludes `scripts/`, instead run `pnpm -F @sinopec-kb/server exec tsc --noEmit scripts/eval/retrieval-replay.ts scripts/eval/retrieval-replay.lib.ts` and expect no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/eval/retrieval-replay.ts
git commit -m "test(@sinopec-kb/server): ✅ add retrieval-replay main script"
```

---

### Task 8: 端到端集成验证(0420 失败题)+ 字段核对

**Files:** none (runtime verification)

- [ ] **Step 1: Confirm `.env.eval` exists and points at tailnet ragflow**

Run: `test -f apps/server/.env.eval && grep -c RAGFLOW_HOST apps/server/.env.eval` Expected: prints `1` (file exists with RAGFLOW_HOST). If missing, copy from `apps/server/scripts/eval/.env.eval.example` and fill `RAGFLOW_HOST=http://ragflow:9380` + a **non-production** `RAGFLOW_API_KEY`.

- [ ] **Step 2: Run replay on the 0420 failed questions**

Run:

```bash
cd apps/server && RAGFLOW_HOST=${RAGFLOW_HOST:-http://ragflow:9380} \
  dotenvx run --env-file=.env.eval -- \
  tsx scripts/eval/retrieval-replay.ts --config scripts/eval/configs/prod-v2-topn10.json --ids 6,14,18 --k 30
```

Expected: console shows `✓ Q6 chunks=…`, `✓ Q14 …`, `✓ Q18 …` and `Wrote …/results/prod-v2-topn10-replay/replay.md`.

- [ ] **Step 3: Inspect the report; verify chunk evidence is real**

Run: `sed -n '1,60p' apps/server/scripts/eval/results/prod-v2-topn10-replay/replay.md` Expected: each Q section has a populated top-k table with non-empty `来源文档` and `content 摘要` columns, a `top_n=10 截断线` row, and a `doc_aggs` footer. **If `来源文档` or `content 摘要` columns are empty** → RAGFlow returned different field names; note the actual keys (e.g. log one raw chunk) and extend the fallback chains in `mapChunk` (Task 3), then re-run. Do not mark complete until columns are populated.

- [ ] **Step 4: Run replay on the 0520 failed questions**

Run:

```bash
cd apps/server && RAGFLOW_HOST=${RAGFLOW_HOST:-http://ragflow:9380} \
  dotenvx run --env-file=.env.eval -- \
  tsx scripts/eval/retrieval-replay.ts --config scripts/eval/configs/0520-baseline.json --ids 4,8,18,19 --k 30
```

Expected: `Wrote …/results/0520-baseline-replay/replay.md` with the four sections populated.

- [ ] **Step 5: Confirm results are gitignored or commit intentionally**

Run: `git check-ignore apps/server/scripts/eval/results/prod-v2-topn10-replay/replay.md && echo IGNORED || echo TRACKED`

- If `IGNORED`: nothing to commit (consistent with existing `results/` handling). Done.
- If `TRACKED`: decide with the user whether to commit the generated `replay.md` evidence or add `results/*-replay/` to `scripts/eval/.gitignore`. Default: leave generated reports untracked.

---

## Self-Review

- **Spec coverage:** §2 形态→Tasks 1–7;§4 CLI→Task 7 `parseArgs`/Task 8 运行;§5 数据流→`buildReplayBody`(T2)+`mapChunk`(T3)+`callRetrievalFull`(T7);§6 输出(截断线/gold/doc_aggs)→T4–T6;§7 错误处理→T7 main(fail-fast + 单题隔离)+ T6 error 分支;§8 测试→T1–T6 specs;§9 验收→T8。覆盖完整。
- **Placeholder scan:** 无 TBD/TODO;每个代码步骤含完整实现;Task 8 的「字段为空则扩展兜底链」是明确的条件化验收动作,非占位。
- **Type consistency:** `ReplayChunk` / `ReplayRetrievalParams` / `QuestionSectionInput` / `ReportMeta` 在 lib 定义,主脚本 import 一致;`scoreRetrieval` 入参用 `{ documentName }` 投影匹配 `ChunkRef`;`QuestionRef` 复用自 `scoring.ts`。函数名 `buildReplayBody`/`mapChunk`/`renderQuestionSection`/`renderReport`/`aggregateDocs`/`parseIdList`/`truncateContent`/`isGoldDoc` 跨任务一致。

## 失败题运行速查

| KB   | config                        | --ids       | 对应文档表题号        |
| ---- | ----------------------------- | ----------- | --------------------- |
| 0420 | `configs/prod-v2-topn10.json` | `6,14,18`   | Q6 / Q14 / Q18        |
| 0520 | `configs/0520-baseline.json`  | `4,8,18,19` | Q24 / Q28 / Q38 / Q39 |
