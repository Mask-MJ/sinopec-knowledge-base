# 实体锚定（验证阶段）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出路径无关的实体锚定纯函数内核，并挂进 retrieval-replay 评测，用于证明"锚定式查询改写"端到端有增益且不再串台回归。

**Architecture:** 四个纯函数（registry 加载 + 校验、detectAnchor、anchorQuery、resolveDocumentIds）+ 一个编排器 applyAnchoring，全部零 IO 可单测；最后用一个 `--anchor` 旗标把编排器挂进只读评测脚本 retrieval-replay。不碰 `completions()`、不改 RAGFlow 配置。

**Tech Stack:** TypeScript（CommonJS, SWC）、vitest、tsx 跑评测脚本。沿用 retrieval-replay 既有"纯逻辑 `.lib`/CLI 编排"分层。

## Global Constraints

- 不修改 `apps/server/src/modules/assistant/assistant.service.ts`（`completions()`）。
- 不修改 RAGFlow 助手配置 / dataset 配置。
- 不新增运行时依赖（**zod 未安装**，registry 校验用手写 fail-fast，语义同 spec §3.1）。
- 所有内核函数为纯函数：不可变、不抛（除 `loadRegistry` 校验失败 fail-fast）、零网络/文件 IO。
- 全部新文件落在 `apps/server/scripts/eval/anchoring/`；seed 配置落 `apps/server/scripts/eval/configs/`。
- 运行单测用显式路径：`pnpm -F @sinopec-kb/server vitest run <spec 路径>`（在 `apps/server/` 下相对路径）。
- 提交 scope 必须用白名单值：`@sinopec-kb/server`。
- 类型契约（跨任务一致）：
  - `interface ProjectAnchor { projectName: string; aliases: string[]; wellNumbers: string[] }`
  - `loadRegistry(raw: unknown): ProjectAnchor[]`
  - `detectAnchor(question: string, registry: ProjectAnchor[]): ProjectAnchor | null`
  - `anchorQuery(question: string, anchor: ProjectAnchor | null): string`
  - `resolveDocumentIds(anchor: ProjectAnchor, datasetDocs: { id: string; name: string }[]): string[]`
  - `applyAnchoring(question, registry, datasetDocs, mode): AnchoredRetrieval`

---

## File Structure

- Create `apps/server/scripts/eval/anchoring/anchor-registry.ts` — `ProjectAnchor` 类型 + `loadRegistry` 手写校验。
- Create `apps/server/scripts/eval/anchoring/anchor-registry.spec.ts`
- Create `apps/server/scripts/eval/configs/anchor-registry.json` — seed 锚点表。
- Create `apps/server/scripts/eval/anchoring/detect-anchor.ts` — `detectAnchor`。
- Create `apps/server/scripts/eval/anchoring/detect-anchor.spec.ts`
- Create `apps/server/scripts/eval/anchoring/anchor-query.ts` — `anchorQuery`。
- Create `apps/server/scripts/eval/anchoring/anchor-query.spec.ts`
- Create `apps/server/scripts/eval/anchoring/resolve-document-ids.ts` — `resolveDocumentIds`。
- Create `apps/server/scripts/eval/anchoring/resolve-document-ids.spec.ts`
- Create `apps/server/scripts/eval/anchoring/apply-anchoring.ts` — `applyAnchoring` 编排器 + `AnchorMode`/`AnchoredRetrieval`。
- Create `apps/server/scripts/eval/anchoring/apply-anchoring.spec.ts`
- Modify `apps/server/scripts/eval/retrieval-replay.ts` — 加 `--anchor <off|rewrite|filter>` 旗标，检索前调 `applyAnchoring`。

---

## Task 1: anchor-registry（类型 + 校验 + seed 配置）

**Files:**

- Create: `apps/server/scripts/eval/anchoring/anchor-registry.ts`
- Create: `apps/server/scripts/eval/configs/anchor-registry.json`
- Test: `apps/server/scripts/eval/anchoring/anchor-registry.spec.ts`

**Interfaces:**

- Consumes: 无。
- Produces: `interface ProjectAnchor { projectName: string; aliases: string[]; wellNumbers: string[] }`；`loadRegistry(raw: unknown): ProjectAnchor[]`。

- [ ] **Step 1: 写失败测试**

```typescript
// apps/server/scripts/eval/anchoring/anchor-registry.spec.ts
import { describe, expect, it } from 'vitest';

import { loadRegistry } from './anchor-registry';

describe('loadRegistry', () => {
  it('parses a valid registry array', () => {
    const raw = [
      {
        projectName: '顺北43',
        aliases: ['顺北43井区'],
        wellNumbers: ['顺北43'],
      },
    ];
    const result = loadRegistry(raw);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('顺北43');
  });

  it('accepts empty aliases / wellNumbers arrays', () => {
    const raw = [{ projectName: '张集东', aliases: [], wellNumbers: [] }];
    expect(loadRegistry(raw)).toHaveLength(1);
  });

  it('throws fail-fast on empty projectName with field path', () => {
    const raw = [{ projectName: '', aliases: [], wellNumbers: [] }];
    expect(() => loadRegistry(raw)).toThrow(/\[0\]\.projectName/);
  });

  it('throws when top-level is not an array', () => {
    expect(() => loadRegistry({})).toThrow(/must be an array/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/anchor-registry.spec.ts` Expected: FAIL — `Cannot find module './anchor-registry'`。

- [ ] **Step 3: 写最小实现**

```typescript
// apps/server/scripts/eval/anchoring/anchor-registry.ts
export interface ProjectAnchor {
  aliases: string[];
  projectName: string;
  wellNumbers: string[];
}

function assertStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${where} must be an array`);
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`${where}[${index}] must be a non-empty string`);
    }
  });
  return value as string[];
}

export function loadRegistry(raw: unknown): ProjectAnchor[] {
  if (!Array.isArray(raw)) {
    throw new Error('anchor registry must be an array');
  }
  return raw.map((item, index) => {
    const where = `anchor registry[${index}]`;
    if (typeof item !== 'object' || item === null) {
      throw new Error(`${where} must be an object`);
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.projectName !== 'string' ||
      record.projectName.length === 0
    ) {
      throw new Error(`${where}.projectName must be a non-empty string`);
    }
    return {
      projectName: record.projectName,
      aliases: assertStringArray(record.aliases, `${where}.aliases`),
      wellNumbers: assertStringArray(
        record.wellNumbers,
        `${where}.wellNumbers`,
      ),
    };
  });
}
```

- [ ] **Step 4: 创建 seed 配置**

```json
// apps/server/scripts/eval/configs/anchor-registry.json
[
  {
    "projectName": "顺北43",
    "aliases": ["顺北43井区", "SB43"],
    "wellNumbers": ["顺北43"]
  },
  {
    "projectName": "顺北42",
    "aliases": ["顺北42井区", "SB42"],
    "wellNumbers": ["顺北42"]
  },
  {
    "projectName": "顺北21",
    "aliases": ["顺北21井区", "SB21"],
    "wellNumbers": ["顺北21"]
  },
  {
    "projectName": "张集东",
    "aliases": ["张集东三维", "张集东工区"],
    "wellNumbers": []
  },
  {
    "projectName": "页岩气",
    "aliases": ["页岩气地震攻关", "2014年页岩气"],
    "wellNumbers": []
  }
]
```

> 注：seed 为最小可用集，实施 Task 6 评测前应对照 gold 文档名补全（项目名要能在 dataset 文档名里命中，见 Task 4 / Task 6）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/anchor-registry.spec.ts` Expected: PASS（4 passed）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/scripts/eval/anchoring/anchor-registry.ts apps/server/scripts/eval/anchoring/anchor-registry.spec.ts apps/server/scripts/eval/configs/anchor-registry.json
git commit -m "feat(@sinopec-kb/server): ✨ add anchor registry type + fail-fast loader for eval anchoring"
```

---

## Task 2: detectAnchor

**Files:**

- Create: `apps/server/scripts/eval/anchoring/detect-anchor.ts`
- Test: `apps/server/scripts/eval/anchoring/detect-anchor.spec.ts`

**Interfaces:**

- Consumes: `ProjectAnchor` from `./anchor-registry`。
- Produces: `detectAnchor(question: string, registry: ProjectAnchor[]): ProjectAnchor | null`。

- [ ] **Step 1: 写失败测试**

```typescript
// apps/server/scripts/eval/anchoring/detect-anchor.spec.ts
import { describe, expect, it } from 'vitest';

import type { ProjectAnchor } from './anchor-registry';

import { detectAnchor } from './detect-anchor';

const registry: ProjectAnchor[] = [
  {
    projectName: '顺北43',
    aliases: ['顺北43井区', 'SB43'],
    wellNumbers: ['顺北43'],
  },
  {
    projectName: '顺北42',
    aliases: ['顺北42井区', 'SB42'],
    wellNumbers: ['顺北42'],
  },
  { projectName: '张集东', aliases: ['张集东三维'], wellNumbers: [] },
  { projectName: '页岩气', aliases: ['页岩气地震攻关'], wellNumbers: [] },
];

describe('detectAnchor', () => {
  it('matches by well number', () => {
    expect(detectAnchor('顺北43的施工日期是什么', registry)?.projectName).toBe(
      '顺北43',
    );
  });

  it('matches by alias', () => {
    expect(detectAnchor('张集东三维的难点有哪些', registry)?.projectName).toBe(
      '张集东',
    );
  });

  it('matches by project name', () => {
    expect(detectAnchor('页岩气项目的观测系统', registry)?.projectName).toBe(
      '页岩气',
    );
  });

  it('returns null when no project is named', () => {
    expect(detectAnchor('本工区的覆盖次数是多少', registry)).toBeNull();
  });

  it('returns null on equal-specificity ambiguity', () => {
    expect(detectAnchor('顺北42和顺北43的对比', registry)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/detect-anchor.spec.ts` Expected: FAIL — `Cannot find module './detect-anchor'`。

- [ ] **Step 3: 写最小实现**

```typescript
// apps/server/scripts/eval/anchoring/detect-anchor.ts
import type { ProjectAnchor } from './anchor-registry';

interface ScoredAnchor {
  anchor: ProjectAnchor;
  score: number;
}

/**
 * 最具体匹配：扫 projectName/aliases/wellNumbers，命中 token 的最大长度作 specificity。
 * 无命中返回 null；存在两个同最高 specificity 的锚点（歧义）也返回 null（安全优先）。
 */
export function detectAnchor(
  question: string,
  registry: ProjectAnchor[],
): ProjectAnchor | null {
  const matches: ScoredAnchor[] = [];
  for (const anchor of registry) {
    const tokens = [
      anchor.projectName,
      ...anchor.aliases,
      ...anchor.wellNumbers,
    ];
    let score = 0;
    for (const token of tokens) {
      if (token.length > 0 && question.includes(token)) {
        score = Math.max(score, token.length);
      }
    }
    if (score > 0) {
      matches.push({ anchor, score });
    }
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => b.score - a.score);
  if (matches.length > 1 && matches[1].score === matches[0].score) {
    return null;
  }
  return matches[0].anchor;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/detect-anchor.spec.ts` Expected: PASS（5 passed）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/scripts/eval/anchoring/detect-anchor.ts apps/server/scripts/eval/anchoring/detect-anchor.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add detectAnchor most-specific matcher with ambiguity guard"
```

---

## Task 3: anchorQuery

**Files:**

- Create: `apps/server/scripts/eval/anchoring/anchor-query.ts`
- Test: `apps/server/scripts/eval/anchoring/anchor-query.spec.ts`

**Interfaces:**

- Consumes: `ProjectAnchor` from `./anchor-registry`。
- Produces: `anchorQuery(question: string, anchor: ProjectAnchor | null): string`。

- [ ] **Step 1: 写失败测试**

```typescript
// apps/server/scripts/eval/anchoring/anchor-query.spec.ts
import { describe, expect, it } from 'vitest';

import type { ProjectAnchor } from './anchor-registry';

import { anchorQuery } from './anchor-query';

const anchor: ProjectAnchor = {
  projectName: '顺北43',
  aliases: ['顺北43井区'],
  wellNumbers: ['顺北43'],
};

describe('anchorQuery', () => {
  it('passes through unchanged when anchor is null', () => {
    const q = '本工区的覆盖次数是多少';
    expect(anchorQuery(q, null)).toBe(q);
  });

  it('weaves project name + well numbers into the query', () => {
    const q = '施工日期是什么';
    const result = anchorQuery(q, anchor);
    expect(result).toContain('顺北43');
    expect(result).toContain(q);
    expect(result).not.toBe(q);
  });

  it('does not mutate the input anchor', () => {
    const snapshot = JSON.parse(JSON.stringify(anchor));
    anchorQuery('施工日期', anchor);
    expect(anchor).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/anchor-query.spec.ts` Expected: FAIL — `Cannot find module './anchor-query'`。

- [ ] **Step 3: 写最小实现**

```typescript
// apps/server/scripts/eval/anchoring/anchor-query.ts
import type { ProjectAnchor } from './anchor-registry';

/**
 * 锚点为 null 时直通；否则把规范项目名 + 井号作为关键词 token 前置织入原 question，
 * 偏置 BM25（关键词权重 0.7 主导）向锚定项目。不可变。
 */
export function anchorQuery(
  question: string,
  anchor: ProjectAnchor | null,
): string {
  if (!anchor) {
    return question;
  }
  const keywords = [anchor.projectName, ...anchor.wellNumbers].filter(
    (token) => token.length > 0,
  );
  const unique = [...new Set(keywords)];
  return `${unique.join(' ')} ${question}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/anchor-query.spec.ts` Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/scripts/eval/anchoring/anchor-query.ts apps/server/scripts/eval/anchoring/anchor-query.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add anchorQuery keyword-biasing rewrite"
```

---

## Task 4: resolveDocumentIds

**Files:**

- Create: `apps/server/scripts/eval/anchoring/resolve-document-ids.ts`
- Test: `apps/server/scripts/eval/anchoring/resolve-document-ids.spec.ts`

**Interfaces:**

- Consumes: `ProjectAnchor` from `./anchor-registry`。
- Produces: `resolveDocumentIds(anchor: ProjectAnchor, datasetDocs: { id: string; name: string }[]): string[]`。

- [ ] **Step 1: 写失败测试**

```typescript
// apps/server/scripts/eval/anchoring/resolve-document-ids.spec.ts
import { describe, expect, it } from 'vitest';

import type { ProjectAnchor } from './anchor-registry';

import { resolveDocumentIds } from './resolve-document-ids';

const docs = [
  { id: 'd1', name: '顺北43三维地震采集报告.docx' },
  { id: 'd2', name: '顺北42采集施工总结.docx' },
  { id: 'd3', name: '顺北43井区工程设计.docx' },
];

const sb43: ProjectAnchor = {
  projectName: '顺北43',
  aliases: ['顺北43井区'],
  wellNumbers: ['顺北43'],
};

describe('resolveDocumentIds', () => {
  it('returns ids of docs whose name matches the anchor', () => {
    expect(resolveDocumentIds(sb43, docs)).toEqual(['d1', 'd3']);
  });

  it('does not match a neighbouring project doc', () => {
    expect(resolveDocumentIds(sb43, docs)).not.toContain('d2');
  });

  it('returns empty array when nothing matches', () => {
    const other: ProjectAnchor = {
      projectName: '张集东',
      aliases: [],
      wellNumbers: [],
    };
    expect(resolveDocumentIds(other, docs)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/resolve-document-ids.spec.ts` Expected: FAIL — `Cannot find module './resolve-document-ids'`。

- [ ] **Step 3: 写最小实现**

```typescript
// apps/server/scripts/eval/anchoring/resolve-document-ids.ts
import type { ProjectAnchor } from './anchor-registry';

/**
 * 把锚点 token（projectName/aliases/wellNumbers）与 dataset 文档名匹配，返回命中的 id。
 * 纯匹配、零 IO；datasetDocs 由调用方拉好后传入。无命中返回 []。
 */
export function resolveDocumentIds(
  anchor: ProjectAnchor,
  datasetDocs: { id: string; name: string }[],
): string[] {
  const tokens = [
    anchor.projectName,
    ...anchor.aliases,
    ...anchor.wellNumbers,
  ].filter((token) => token.length > 0);
  const ids: string[] = [];
  for (const doc of datasetDocs) {
    if (tokens.some((token) => doc.name.includes(token))) {
      ids.push(doc.id);
    }
  }
  return [...new Set(ids)];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/resolve-document-ids.spec.ts` Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/scripts/eval/anchoring/resolve-document-ids.ts apps/server/scripts/eval/anchoring/resolve-document-ids.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add resolveDocumentIds filename matcher"
```

---

## Task 5: applyAnchoring 编排器

**Files:**

- Create: `apps/server/scripts/eval/anchoring/apply-anchoring.ts`
- Test: `apps/server/scripts/eval/anchoring/apply-anchoring.spec.ts`

**Interfaces:**

- Consumes: `detectAnchor`、`anchorQuery`、`resolveDocumentIds`、`ProjectAnchor`。
- Produces:
  - `type AnchorMode = 'filter' | 'off' | 'rewrite'`
  - `interface AnchoredRetrieval { anchor: ProjectAnchor | null; documentIds?: string[]; question: string }`
  - `applyAnchoring(question: string, registry: ProjectAnchor[], datasetDocs: { id: string; name: string }[], mode: AnchorMode): AnchoredRetrieval`

- [ ] **Step 1: 写失败测试**

```typescript
// apps/server/scripts/eval/anchoring/apply-anchoring.spec.ts
import { describe, expect, it } from 'vitest';

import type { ProjectAnchor } from './anchor-registry';

import { applyAnchoring } from './apply-anchoring';

const registry: ProjectAnchor[] = [
  { projectName: '顺北43', aliases: ['顺北43井区'], wellNumbers: ['顺北43'] },
];
const docs = [
  { id: 'd1', name: '顺北43三维采集报告.docx' },
  { id: 'd2', name: '顺北42采集.docx' },
];

describe('applyAnchoring', () => {
  it('mode off → passthrough, no anchor', () => {
    const r = applyAnchoring('顺北43的施工日期', registry, docs, 'off');
    expect(r.question).toBe('顺北43的施工日期');
    expect(r.anchor).toBeNull();
    expect(r.documentIds).toBeUndefined();
  });

  it('mode rewrite + match → rewritten question, anchor set', () => {
    const r2 = applyAnchoring('顺北43的施工日期', registry, docs, 'rewrite');
    expect(r2.anchor?.projectName).toBe('顺北43');
    expect(r2.question).toContain('顺北43');
    expect(r2.question).not.toBe('顺北43的施工日期');
    // 无锚词 → 直通
    const r1 = applyAnchoring('施工日期是什么', registry, docs, 'rewrite');
    expect(r1.anchor).toBeNull();
  });

  it('mode filter + match → documentIds set, question unchanged', () => {
    const r = applyAnchoring('顺北43的施工日期', registry, docs, 'filter');
    expect(r.documentIds).toEqual(['d1']);
    expect(r.question).toBe('顺北43的施工日期');
  });

  it('no anchor → passthrough regardless of mode', () => {
    const r = applyAnchoring('本工区覆盖次数', registry, docs, 'filter');
    expect(r.anchor).toBeNull();
    expect(r.documentIds).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/apply-anchoring.spec.ts` Expected: FAIL — `Cannot find module './apply-anchoring'`。

- [ ] **Step 3: 写最小实现**

```typescript
// apps/server/scripts/eval/anchoring/apply-anchoring.ts
import type { ProjectAnchor } from './anchor-registry';

import { anchorQuery } from './anchor-query';
import { detectAnchor } from './detect-anchor';
import { resolveDocumentIds } from './resolve-document-ids';

export type AnchorMode = 'filter' | 'off' | 'rewrite';

export interface AnchoredRetrieval {
  anchor: ProjectAnchor | null;
  documentIds?: string[];
  question: string;
}

export function applyAnchoring(
  question: string,
  registry: ProjectAnchor[],
  datasetDocs: { id: string; name: string }[],
  mode: AnchorMode,
): AnchoredRetrieval {
  if (mode === 'off') {
    return { question, anchor: null };
  }
  const anchor = detectAnchor(question, registry);
  if (!anchor) {
    return { question, anchor: null };
  }
  if (mode === 'rewrite') {
    return { question: anchorQuery(question, anchor), anchor };
  }
  const documentIds = resolveDocumentIds(anchor, datasetDocs);
  return {
    question,
    anchor,
    documentIds: documentIds.length > 0 ? documentIds : undefined,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @sinopec-kb/server vitest run scripts/eval/anchoring/apply-anchoring.spec.ts` Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/scripts/eval/anchoring/apply-anchoring.ts apps/server/scripts/eval/anchoring/apply-anchoring.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ add applyAnchoring orchestrator (off/rewrite/filter modes)"
```

---

## Task 6: 把 `--anchor` 挂进 retrieval-replay 评测

**Files:**

- Modify: `apps/server/scripts/eval/retrieval-replay.ts`

**Interfaces:**

- Consumes: `applyAnchoring` from `./anchoring/apply-anchoring`、`loadRegistry` from `./anchoring/anchor-registry`。
- Produces: 评测脚本支持 `--anchor <off|rewrite|filter>`（默认 `off`）。

> 这是集成任务：先通读 `retrieval-replay.ts` 全文（约 222 行）与 `retrieval-replay.lib.ts` 找到 ① CLI 参数解析处（现有 `--config/--ids/--k` 解析，参考 `parseIdList`）② 每题构建检索 body 的位置（`buildReplayBody` 调用点）。把 anchoring 插在"拿到 question 之后、构建 retrieval body 之前"。

- [ ] **Step 1: 读取集成点**

Run: `sed -n '70,222p' apps/server/scripts/eval/retrieval-replay.ts`（记下参数解析与逐题检索循环的确切行号）。另读 `retrieval-replay.lib.ts` 确认 `buildReplayBody` 的入参（question / document_ids 字段名）。

- [ ] **Step 2: 加 import 与参数解析**

在文件顶部 import 区加（`readFileSync`/`resolve` 已 import 则复用）：

```typescript
import { loadRegistry } from './anchoring/anchor-registry';
import { applyAnchoring } from './anchoring/apply-anchoring';
import type { AnchorMode } from './anchoring/apply-anchoring';
```

在 CLI 参数解析处（紧邻 `--k` 解析）加：

```typescript
const anchorArg = process.argv[process.argv.indexOf('--anchor') + 1];
const anchorMode: AnchorMode =
  process.argv.includes('--anchor') &&
  ['off', 'rewrite', 'filter'].includes(anchorArg)
    ? (anchorArg as AnchorMode)
    : 'off';

const registry =
  anchorMode === 'off'
    ? []
    : loadRegistry(
        JSON.parse(
          readFileSync(
            resolve(__dirname, 'configs/anchor-registry.json'),
            'utf8',
          ),
        ),
      );
```

- [ ] **Step 3: 逐题应用 anchoring**

`filter` 模式需要 dataset 文档名表，仅该模式拉一次（rewrite/off 传空数组）：

```typescript
// 仅 filter 模式需要文档名→id 映射；rewrite/off 传空数组即可
const datasetDocs: { id: string; name: string }[] =
  anchorMode === 'filter' ? await fetchDatasetDocs(config.datasetIds) : [];
```

在构建每题检索 body 前：

```typescript
const anchored = applyAnchoring(
  row.question,
  registry,
  datasetDocs,
  anchorMode,
);
// 用 anchored.question 替换原 question 喂给 buildReplayBody；
// anchored.documentIds 非空时塞进检索 body 的 document_ids 字段。
```

并在该题的 replay.md section 头部追加一行标注： `anchor: <projectName|none>  mode: <mode>  rewritten: <anchored.question>`。

> `fetchDatasetDocs` 若脚本未现成：用已存在的 `api<T>()` 仿 `apps/server/src/modules/knowledge-base/knowledge-base.service.ts:611` 的 `listAllDatasetDocs` 分页（page_size 1000、按短页终止）拉 `GET /api/v1/datasets/{id}/documents` 的 `{ docs: { id, name }[] }`，映射成 `{ id, name }`。多 datasetId 时拉全并 concat。

- [ ] **Step 4: 编译检查 + 干跑验证**

Run: `pnpm -F @sinopec-kb/server exec tsc --noEmit -p tsconfig.json`（确认无类型错误）。Run（基线，确认未回归）: `cd apps/server && dotenvx run --env-file=.env.eval -- tsx scripts/eval/retrieval-replay.ts --config scripts/eval/configs/<现有cfg>.json --ids 14 --k 30` Expected: 正常产出 replay.md，section 头出现 `anchor: none  mode: off`。Run（改写）: 同上加 `--anchor rewrite` Expected: Q14 section 头 `anchor: 顺北43  mode: rewrite  rewritten: 顺北43 ...`，改写 query 生效。

- [ ] **Step 5: 提交**

```bash
git add apps/server/scripts/eval/retrieval-replay.ts
git commit -m "feat(@sinopec-kb/server): ✨ wire --anchor off/rewrite/filter into retrieval-replay"
```

---

## Task 7: 评测对照（验证增益，非编码）

**Files:** 无（产出 replay 报告 + 结论）。

- [ ] **Step 1: 三路对照跑失败 7 题**

对 Q6/Q14/Q18/Q24/Q28/Q38/Q39（按 0520 题号映射 `localId = globalQ − 20`）各跑 `--anchor off|rewrite|filter`，`--k 30`，记录每题 gold 段是否进 top-10 窗口。

- [ ] **Step 2: 全量回归跑 off vs rewrite**

对全量题集跑 `off` 与 `rewrite`，统计 gold@10 与正确段入窗率差值，确认**不再净负**（上一轮 query 改写 −54 的回归点）。

- [ ] **Step 3: 记录结论**

把对照结果追加到 `docs/rag-retrieval-replay-diagnosis-2026-06.md`（新小节），并据"改写是否逼近 filter 上界 + 全量不再净负"判定是否进入 live 接入 spec。更新记忆 `rag-entity-anchoring`（标注评测已验证/未验证）。

---

## Self-Review

**Spec coverage:**

- §3.1 anchor-registry → Task 1 ✅（zod 改手写校验，Global Constraints 已注明偏离）
- §3.2 detectAnchor → Task 2 ✅
- §3.3 anchorQuery → Task 3 ✅
- §3.4 resolveDocumentIds → Task 4 ✅
- §3.5 评测挂钩 `--anchor` → Task 6 ✅（编排器 Task 5 先行）
- §6 测试策略（纯函数单测 + 评测集成）→ Task 1–5 单测 + Task 7 评测 ✅
- §6 验收（Q14 入窗 + 全量不净负）→ Task 7 ✅

**Placeholder scan:** Task 1–5 全为完整可运行代码 + 确切命令/期望输出。Task 6 集成步骤含确切 import/参数解析/调用代码；`fetchDatasetDocs` 给了确切实现参照（`listAllDatasetDocs` 分页法 + 确切端点）而非占位。Task 7 为非编码评测，列了确切题号与判据。

**Type consistency:** `ProjectAnchor`（Task 1）被 Task 2–5 一致消费；`detectAnchor`/`anchorQuery`/`resolveDocumentIds` 签名在 Task 5 `applyAnchoring` 内按 Global Constraints 契约调用一致；`AnchorMode`/`AnchoredRetrieval`（Task 5）被 Task 6 一致消费。无签名漂移。
