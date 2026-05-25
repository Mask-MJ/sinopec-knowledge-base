# Shift RAGFlow Reference Off-By-One Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 RAGFlow `GET /api/v1/chats/{id}/sessions` API 的 off-by-one merge bug —— 它把 reference 数组按顺序挂到所有 assistant message 上（**包括开场白**），导致每个 assistant 显示的 reference 实际是**下一条答案**的引用，最新一条 assistant 因 reference 数组用完而无引用。

**Architecture:** RAGFlow 的 `conversation` 表实际把 `message`（消息列表）和 `reference`（引用列表）分两列存，`reference` 长度 = 已完成 Q-A 轮数（不含开场白）。GET API merge 时未跳过开场白，造成整体往前错位一格。修复方案：在我们的 `normalizeMessageReferences` 透传层做**反向移位** —— 把 RAGFlow 挂在 `messages[k]`（第 k 个 assistant）上的 chunks 转移到 `messages[next assistant]`（第 k+1 个 assistant），开场白上的 chunks 实际是 a1 的引用，转移给 a1；最后一个 assistant 拿到原本错位丢失的 reference。同时保留把扁平 `chunk[]` 包装成 `{chunks, doc_aggs}` 的现有逻辑。

**Tech Stack:** TypeScript, Vitest, NestJS。无需 schema migration、无需 Redis cache、无需 SSE tap。

**取代方案对比：**

| 方案                      | 工程量            | 修复范围   | 数据正确性 |
| ------------------------- | ----------------- | ---------- | ---------- |
| A Redis cache             | ~80 行            | 仅最新一条 | 仍错位     |
| B 自建 schema             | ~2 天             | 全部       | 正确       |
| **F 反向移位（本 plan）** | **~30 行 + 测试** | **全部**   | **正确**   |

**风险评估：** 假设 RAGFlow upstream 不修这个 merge bug。即使 RAGFlow 升级修了，最坏情况是我们的 shift 与新 merge 叠加再次错位 —— 用 spec 锁定行为，升级时跑一次回归测试即可发现。

**Recon 证据（已在 prod RAGFlow MySQL 实测）:**

- 1-轮 session: `JSON_LENGTH(message)=3, JSON_LENGTH(reference)=1`，merge 后开场白 has_ref=true、a1 has_ref=false
- 47-msg session（23 轮 Q-A）: `JSON_LENGTH(message)=47, JSON_LENGTH(reference)=23`，merge 后 messages[0,2,4...44] 都有 ref、messages[46] 没有
- RAGFlow 源码 `/ragflow/api/apps/sdk/session.py:609-660` 的 `list_session()` 函数 while loop 没跳开场白，确认 off-by-one
- 内容验证：1-轮 session 的 `ref[0].chunks[4]` 内容是 "理论设计炮点63750个"，对应 a1 答案里 [ID:4] 标记 → 证实"挂在开场白上的实际是 a1 的真实 reference"

---

## File Structure

| 路径 | 责任 | 改动类型 |
| --- | --- | --- |
| [apps/server/src/modules/assistant/normalize-reference.ts](apps/server/src/modules/assistant/normalize-reference.ts) | 把 `normalizeMessageReferences` 内部 "drop opener" 逻辑替换为 "shift forward" | Modify (函数签名不变) |
| [apps/server/src/modules/assistant/normalize-reference.spec.ts](apps/server/src/modules/assistant/normalize-reference.spec.ts) | 重写测试：移位语义 + RAGFlow off-by-one quirk 模拟 | Modify |
| [apps/server/src/modules/assistant/assistant.service.ts](apps/server/src/modules/assistant/assistant.service.ts) | 不改（normalize 函数签名兼容） | 不变 |
| [apps/server/src/modules/assistant/assistant.service.spec.ts](apps/server/src/modules/assistant/assistant.service.spec.ts) | 已有 spec 喂的是"RAGFlow 已经把扁平 chunks 挂到 messages[i]"形态 → 需要更新成 RAGFlow 真实 off-by-one 形态，验证 service 层透传后能正确移位 | Modify |
| `.changeset/fix-ragflow-reference-shift.md` | 版本变更记录 | **Create** |

> **注意**：不需要在 plan A / B 之间纠结 —— 本 plan 完整取代两者。stash 里 A 方案的 Redis cache 代码可以 drop。

---

## Task 1: 写失败测试覆盖 RAGFlow off-by-one 移位修复（红）

**Files:**

- Modify: `apps/server/src/modules/assistant/normalize-reference.spec.ts`

**Why this task exists:** 现有 spec 是按"RAGFlow 把 chunks 挂在正确的 assistant 上"假设设计的，但实测 RAGFlow 是错位挂的。我们需要新一组测试反映真实 off-by-one 输入，并断言 shift 后的输出。

- [ ] **Step 1: 重写整个 spec 文件**

把 `apps/server/src/modules/assistant/normalize-reference.spec.ts` 整个替换为下面的内容（保留同名 helper `chunk()`，但测试场景改为反映 RAGFlow off-by-one 实际行为）：

```typescript
import type { RagflowChunk, RagflowRawMessage } from './normalize-reference';

import { describe, expect, it } from 'vitest';

import { normalizeMessageReferences } from './normalize-reference';

const chunk = (overrides: Partial<RagflowChunk> = {}): RagflowChunk => ({
  id: overrides.id ?? 'c1',
  content: overrides.content ?? 'content',
  dataset_id: overrides.dataset_id ?? 'd1',
  doc_type: overrides.doc_type ?? '',
  document_id: overrides.document_id ?? 'doc-A',
  document_name: overrides.document_name ?? 'A.docx',
  image_id: overrides.image_id ?? '',
  positions: overrides.positions ?? [],
  similarity: overrides.similarity ?? 0.9,
  term_similarity: overrides.term_similarity ?? 0.5,
  url: overrides.url ?? null,
  vector_similarity: overrides.vector_similarity ?? 0.7,
  ...overrides,
});

describe('normalizeMessageReferences (RAGFlow off-by-one shift fix)', () => {
  it('1-round session: ref RAGFlow misplaced on opener gets shifted to a1', () => {
    // RAGFlow 把 ref[0] (a1 真实引用) 挂到了 messages[0] (opener)
    // messages[2] (a1) 没分到 reference
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: '你好！我是你的助理，有什么可以帮到你的吗？',
        reference: [chunk({ id: 'real-a1-ref' })],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1 [ID:0]' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks).toHaveLength(1);
    expect(result[2]?.reference?.chunks[0]?.id).toBe('real-a1-ref');
  });

  it('multi-round session: each assistant gets the chunks RAGFlow misplaced on the previous assistant', () => {
    // RAGFlow merge 后实际形态：
    //   messages[0] (opener)  ← misplaced ref of a1
    //   messages[2] (a1)      ← misplaced ref of a2
    //   messages[4] (a2)      ← (RAGFlow ref 数组用完，没分到)
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'real-a1' })],
      },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1 [ID:0]',
        reference: [chunk({ id: 'real-a2' })],
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2 [ID:0]' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks[0]?.id).toBe('real-a1');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('real-a2');
  });

  it('three-round session: shift propagates correctly through all assistants', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'r-for-a1' })],
      },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'r-for-a2' })],
      },
      { role: 'user', content: 'q2' },
      {
        role: 'assistant',
        content: 'a2',
        reference: [chunk({ id: 'r-for-a3' })],
      },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]?.reference?.chunks[0]?.id).toBe('r-for-a1');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('r-for-a2');
    expect(result[6]?.reference?.chunks[0]?.id).toBe('r-for-a3');
  });

  it('builds doc_aggs from shifted chunks aggregated by document_id', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c2', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c3', document_id: 'doc-B', document_name: 'B.docx' }),
        ],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[2]?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('opener-only new session (no user yet): no reference attached anywhere', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: '你好！',
        reference: [chunk({ id: 'leftover' })],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
  });

  it('all assistants empty reference (RAGFlow gave none): all dropped', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'opener' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]).not.toHaveProperty('reference');
  });

  it('user messages pass through untouched', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'r' })],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).toEqual({ role: 'user', content: 'q1' });
  });

  it('empty reference array on an assistant is treated as no reference (no shift contribution)', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'opener', reference: [] },
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'real-a2' })],
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]).not.toHaveProperty('reference');
    expect(result[2]).not.toHaveProperty('reference');
    expect(result[4]?.reference?.chunks[0]?.id).toBe('real-a2');
  });

  it('does not mutate the input array', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'opener',
        reference: [chunk({ id: 'r' })],
      },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const snapshot = structuredClone(raw);
    normalizeMessageReferences(raw);
    expect(raw).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: 跑测试，确认 fail**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/normalize-reference.spec.ts
```

Expected: 多个 test FAIL，提示 `result[2]?.reference?.chunks[0]?.id` 期望 `'real-a1-ref'` 但实际 `undefined`。当前 `normalizeMessageReferences` 是 drop-opener + 原地保留逻辑，没移位。

- [ ] **Step 3: 不 commit（红阶段产物，等绿一起提）**

---

## Task 2: 实现 shift forward 移位修复（绿）

**Files:**

- Modify: `apps/server/src/modules/assistant/normalize-reference.ts`

**Why this task exists:** Task 1 锁定了"shift forward"语义。本任务只重写 normalize 函数主体，保持函数签名 / 入参 / 出参类型完全不变，让 service 层零改动。

- [ ] **Step 1: 替换 normalize 主函数 + 文档注释**

打开 `apps/server/src/modules/assistant/normalize-reference.ts`，找到现有的 `normalizeMessageReferences` 函数（包括上方注释），整段替换为：

```typescript
/**
 * 修复 RAGFlow `GET /api/v1/chats/{id}/sessions` API 的 off-by-one merge bug。
 *
 * RAGFlow `conversation` 表设计：`message` 列存消息列表，`reference` 列存引用
 * 列表（按 Q-A 轮次排，长度 = 已完成回答数 = assistant 数 - 1，开场白没引用）。
 * GET API merge 时（[ragflow/api/apps/sdk/session.py list_session()]）按顺序
 * 把 `ref[i]` 挂到第 i 个 `role != 'user'` 的 message 上，**没有跳过开场白**，
 * 导致整体错位：
 *
 *   messages[0] (开场白)   ← 被挂上 ref[0] = a1 的真实引用
 *   messages[2] (a1)       ← 被挂上 ref[1] = a2 的真实引用
 *   messages[4] (a2)       ← 被挂上 ref[2] = a3 的真实引用
 *   ...
 *   messages[2n] (a_n)     ← 没分到（ref 数组用完）
 *
 * 修复：把每条 assistant 上 RAGFlow 挂的 chunks 转移给"下一个 assistant"。
 * 开场白自己丢掉 reference；最新一条原本错位丢失的 reference 由倒数第二个
 * assistant 的 chunks 补回。
 *
 * 同时把 RAGFlow 持久化的扁平 `chunk[]` 包装成前端期望的
 * `{chunks, doc_aggs}` 形态（doc_aggs 从 chunks 按 document_id 聚合派生）。
 *
 * 该函数是纯函数，不修改入参。
 */
export function normalizeMessageReferences(
  messages: ReadonlyArray<RagflowRawMessage>,
): NormalizedMessage[] {
  // 收集所有 assistant message 在 messages 中的索引（按出现顺序）
  const assistantIndexes: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'assistant') {
      assistantIndexes.push(i);
    }
  }

  // 为每个 assistant 索引计算"它真正应该看到的 chunks"——
  // 即 RAGFlow 挂在【上一个】assistant 上的 chunks（off-by-one 反向修正）。
  // 第一个 assistant（开场白）没有"上一个"，所以 reference 为空。
  const correctedChunksByIndex = new Map<number, RagflowChunk[]>();
  for (let k = 1; k < assistantIndexes.length; k++) {
    const prevAssistantIndex = assistantIndexes[k - 1];
    if (prevAssistantIndex === undefined) continue;
    const misplacedRef = messages[prevAssistantIndex]?.reference;
    if (misplacedRef && misplacedRef.length > 0) {
      const targetIndex = assistantIndexes[k];
      if (targetIndex !== undefined) {
        correctedChunksByIndex.set(targetIndex, misplacedRef);
      }
    }
  }

  return messages.map((msg, i) => {
    const { reference: _ignored, ...rest } = msg;
    const corrected = correctedChunksByIndex.get(i);
    if (!corrected || corrected.length === 0) {
      return { ...rest };
    }
    return { ...rest, reference: buildReferenceEntity(corrected) };
  });
}
```

> **不要动** `RagflowChunk` / `RagflowRawMessage` / `NormalizedMessage` 类型定义，也不要动 `buildReferenceEntity` 函数 —— 它们仍是 normalize 的合作者。

- [ ] **Step 2: 跑测试，确认全绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/normalize-reference.spec.ts
```

Expected: 9 tests passed（Task 1 写的全部）。

- [ ] **Step 3: 跑完整 assistant 模块测试，确认没破坏 service spec**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
```

Expected: 看 service spec 是否过。`assistant.service.spec.ts` 现在喂的是"RAGFlow 把扁平 chunks 直接挂在最终 assistant 上"形态（以前的假设），新 shift 逻辑下这种输入会被识别为 off-by-one → 把 chunks 转移给下一个 assistant，导致原断言失败。

如果 service spec FAIL，进 Task 3 修。如果意外通过，跳到 Task 4。

- [ ] **Step 4: 不 commit（等 service spec 一起绿了一起提）**

---

## Task 3: 修复 service spec 让其反映 RAGFlow off-by-one 输入形态

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.spec.ts`

**Why this task exists:** 现有 service spec 喂的 mock data 假设 RAGFlow 把 chunks 直接挂在"该回答"的 assistant 上，但真实 RAGFlow 是 off-by-one 挂。新的 shift 逻辑要求 spec 输入反映真实形态。

- [ ] **Step 1: 改写 spec 第一个 it `normalizes flat chunk[] reference into { chunks, doc_aggs } per assistant message`**

打开 `apps/server/src/modules/assistant/assistant.service.spec.ts`，找到这个 it，把 mock 改为反映 RAGFlow off-by-one 真实形态：

Replace（原 it 内容）：

```typescript
it('normalizes flat chunk[] reference into { chunks, doc_aggs } per assistant message', async () => {
  ragflow.request.mockResolvedValue([
    {
      id: 's1',
      chat_id: 'rf-1',
      name: '会话 1',
      messages: [
        { role: 'assistant', content: '你好！' },
        { role: 'user', content: 'q1' },
        {
          role: 'assistant',
          content: 'a1 [ID:0]',
          reference: [
            fakeChunk('c1', 'doc-A', 'A.docx'),
            fakeChunk('c2', 'doc-A', 'A.docx'),
            fakeChunk('c3', 'doc-B', 'B.docx'),
          ],
        },
      ],
    },
  ]);

  const result = await service.findAllSessions(1, createMockActiveUser(), {});

  expect(result).toHaveLength(1);
  const a1 = result[0]?.messages[2];
  expect(a1?.reference?.chunks).toHaveLength(3);
  expect(a1?.reference?.doc_aggs).toEqual([
    { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
    { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
  ]);
});
```

With（新 it 内容，模拟 RAGFlow 把 a1 真实引用错挂到开场白上）：

```typescript
it('shifts ragflow off-by-one reference: chunks misplaced on opener get assigned to a1, doc_aggs derived', async () => {
  ragflow.request.mockResolvedValue([
    {
      id: 's1',
      chat_id: 'rf-1',
      name: '会话 1',
      messages: [
        // RAGFlow off-by-one：a1 的真实引用被挂到开场白上
        {
          role: 'assistant',
          content: '你好！',
          reference: [
            fakeChunk('c1', 'doc-A', 'A.docx'),
            fakeChunk('c2', 'doc-A', 'A.docx'),
            fakeChunk('c3', 'doc-B', 'B.docx'),
          ],
        },
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1 [ID:0]' },
      ],
    },
  ]);

  const result = await service.findAllSessions(1, createMockActiveUser(), {});

  expect(result).toHaveLength(1);
  expect(result[0]?.messages[0]).not.toHaveProperty('reference');
  const a1 = result[0]?.messages[2];
  expect(a1?.reference?.chunks).toHaveLength(3);
  expect(a1?.reference?.doc_aggs).toEqual([
    { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
    { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
  ]);
});
```

- [ ] **Step 2: 改写第二个 it `drops reference field for assistant messages where RAGFlow truncated persistence`**

把第二个 it 的标题和断言更新成"shift 之后最新一条 assistant 没分到 reference"的语义：

Replace：

```typescript
it('drops reference field for assistant messages where RAGFlow truncated persistence', async () => {
  ragflow.request.mockResolvedValue([
    {
      id: 's2',
      chat_id: 'rf-1',
      name: '截断会话',
      messages: [
        { role: 'assistant', content: '你好！' },
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'truncated' },
      ],
    },
  ]);

  const result = await service.findAllSessions(1, createMockActiveUser(), {});
  expect(result[0]?.messages[2]).not.toHaveProperty('reference');
});
```

With：

```typescript
it('drops reference everywhere when RAGFlow has not yet attached any reference (new session, no completed Q-A)', async () => {
  ragflow.request.mockResolvedValue([
    {
      id: 's2',
      chat_id: 'rf-1',
      name: '空会话',
      messages: [
        { role: 'assistant', content: '你好！' },
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'truncated' },
      ],
    },
  ]);

  const result = await service.findAllSessions(1, createMockActiveUser(), {});
  expect(result[0]?.messages[0]).not.toHaveProperty('reference');
  expect(result[0]?.messages[2]).not.toHaveProperty('reference');
});
```

- [ ] **Step 3: 跑测试，确认全绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
```

Expected: 全绿（normalize-reference.spec.ts 9 tests + assistant.service.spec.ts 3 tests = 12 tests passed）。

- [ ] **Step 4: 跑 typecheck**

```bash
pnpm -F @sinopec-kb/server typecheck
```

Expected: no errors。

- [ ] **Step 5: commit（normalize 实现 + spec 更新一起提）**

```bash
git add apps/server/src/modules/assistant/normalize-reference.ts \
        apps/server/src/modules/assistant/normalize-reference.spec.ts \
        apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(@sinopec-kb/server): 🐛 shift RAGFlow reference forward to fix off-by-one merge bug

RAGFlow GET /api/v1/chats/{id}/sessions 在合并 conversation.message 与
conversation.reference 两列时，按顺序把 ref[i] 挂到第 i 个 assistant message
上但没跳过开场白，导致整体错位：开场白上挂的实际是 a1 的真实引用，a1 上挂的
是 a2 的，最新一条 a_n 因 ref 数组用完而无引用。

normalizeMessageReferences 改为反向移位：把每条 assistant 上 RAGFlow 挂的
chunks 转给下一个 assistant，开场白自己丢掉。最新一条原本错位丢失的 reference
由倒数第二个 assistant 上的 chunks 补回，所有 reference 都正确显示。

不依赖 Redis cache、不动 schema —— 数据本来就在 RAGFlow conversation.reference
列里，只是 GET API merge 错位。完整覆盖测试 + service spec 同步更新。
EOF
)"
```

---

## Task 4: Changeset

**Files:**

- Create: `.changeset/fix-ragflow-reference-shift.md`

- [ ] **Step 1: 创建 changeset**

`.changeset/fix-ragflow-reference-shift.md`：

```markdown
---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 反向移位修复 RAGFlow GET /sessions 的 off-by-one merge bug

实测 RAGFlow `conversation` 表把 messages 和 reference 分两列存，GET API merge 时按顺序把 `ref[i]` 挂到第 i 个 assistant message 上**没跳过开场白**，导致：

- 开场白上挂的实际是 a1 的真实引用
- 每条 assistant 上挂的实际是下一条答案的真实引用
- 最新一条 assistant 因 reference 数组用完而无引用

`normalizeMessageReferences` 改为反向移位：把每条 assistant 上的 chunks 转给下一个 assistant，开场白丢掉自己的，最新一条由倒数第二个 assistant 上的 chunks 补回。所有 reference 正确归位。

不依赖 Redis cache、不需新建 schema、不需 SSE tap —— 数据本来就在 RAGFlow `conversation.reference` 列里，纯透传层修复。
```

- [ ] **Step 2: commit**

```bash
git add .changeset/fix-ragflow-reference-shift.md
git commit -m "chore(@sinopec-kb/server): 🔨 add changeset for RAGFlow reference shift fix"
```

---

## Task 5: 推送、PR、合并、部署、验证

**Files:**

- 不改代码

- [ ] **Step 1: 切分支推送**

```bash
git checkout -b fix/shift-ragflow-reference
git push -u origin fix/shift-ragflow-reference
```

- [ ] **Step 2: 开 PR**

````bash
gh pr create --repo Mask-MJ/sinopec-knowledge-base \
  --base main \
  --head fix/shift-ragflow-reference \
  --title "fix(@sinopec-kb/server): 🐛 shift RAGFlow reference to fix off-by-one merge" \
  --body "$(cat <<'EOF'
## Summary

实测发现 RAGFlow GET /api/v1/chats/{id}/sessions 在 merge `conversation.message` + `conversation.reference` 时是 off-by-one 错位的：开场白上挂的是 a1 的真实引用，每条 assistant 上挂的是下一条的真实引用，最新一条因 ref 数组用完而无引用。

修复：反向移位 —— 把每条 assistant 上的 chunks 转给下一个 assistant。所有 reference 正确归位，最新一条也能正确显示。

## Why not Redis cache / Why not new schema

数据本来就在 RAGFlow conversation.reference 列里，没丢、没缺。不需要 cache、不需要新 schema、不需要 SSE tap —— 纯 server transform 层修复。

## Verification (post-deploy)

1. 进入有真实 Q-A 历史的 session，刷新页面
2. 点 [N] 上标 → 弹出文档名 + 相似度 + 原文片段（**不再** "未携带引用数据"）
3. 流式答完不刷新点 [N] → 也能正确显示
4. 多轮对话每条 assistant 的 [N] 引用内容应该和该轮答案的事实匹配（之前是错位的下一条引用）

## Tests

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
# 12 tests passed
````

EOF )"

````

- [ ] **Step 3: squash merge**

```bash
PR_NUMBER=$(gh pr list --repo Mask-MJ/sinopec-knowledge-base --head fix/shift-ragflow-reference --json number --jq '.[0].number')
gh pr merge "$PR_NUMBER" --repo Mask-MJ/sinopec-knowledge-base --squash --delete-branch
````

Expected: state=MERGED。

- [ ] **Step 4: 部署到 prod**

```bash
ssh ragflow "cd /root/sinopec-knowledge-base && git pull --ff-only origin main && docker compose build app && docker compose up -d app"
```

Expected: app 容器 recreate，等 healthcheck 绿。

- [ ] **Step 5: 等 prod healthy**

```bash
for i in 1 2 3 4 5 6 7 8; do
  if curl -sf http://39.96.194.119/api/monitor/health -m 3 -o /tmp/h.json 2>/dev/null; then
    cat /tmp/h.json && echo " | ready"; exit 0
  fi
  sleep 3
done
```

Expected: `{"status":"ok",...}`。

- [ ] **Step 6: 浏览器手动 e2e 验证**

打开 `http://39.96.194.119/assistant/chat/3`：

1. 进入有 Q-A 历史的会话（左侧任意一条已有对话的"新会话"）
2. 等历史加载完，点答案中的 `[N]` 上标 → 应弹出**该答案对应文档**的片段
3. **核心验证**：在多轮 session 里，确认 a1 的 [N] 引用内容跟 a1 答案事实匹配（不是 a2 的内容）；最新一条 a_n 的 [N] 也能弹出
4. 新建会话发起 1 轮 Q-A，等流式答完点 [N] → 正常弹出
5. F5 刷新，再点 [N] → 仍正常弹出

如果 step 3 / 5 出问题，回滚 + 抓 SSE / RAGFlow conversation 表数据来分析。

- [ ] **Step 7: 清理 stash（plan A 残留）**

确认 prod 验证通过后，把 stash 里 plan A 的代码丢弃：

```bash
git stash list
# 找到 wip-plan-a-redis-cache 那条
git stash drop stash@{0}  # 序号根据 list 输出确定
```

---

## Self-Review Checklist

- [x] 每个 task 都有完整代码块、可粘贴、无 TBD
- [x] 命令含期望输出（PASS/FAIL/JSON 形态）
- [x] 类型一致：`RagflowRawMessage` / `NormalizedMessage` / `RagflowChunk` 在 normalize.ts 与 spec / service.ts 间统一，函数签名零变化
- [x] TDD 顺序：先红（Task 1）后绿（Task 2 + 3 联动）
- [x] 提交粒度：normalize fix（含 service spec 修复）+ changeset，2 个 commit，符合 frequent commits
- [x] 覆盖原 spec：解决"刷新后引用丢失"+"中间引用错位"两个真问题
- [x] 不依赖未实现的接口或方案 A / B 残留代码
- [x] 部署 + 验证步骤明确

## Recon Findings (已实测)

> 写本 plan 前已在 prod RAGFlow MySQL 实测，证据已记录。

- RAGFlow `conversation` 表：`message` 列 = JSON 数组消息，`reference` 列 = JSON 数组引用，**两列分开存**
- 1-轮 session: `JSON_LENGTH(message)=3, JSON_LENGTH(reference)=1`
- 47-msg session（23 完成轮次）: `JSON_LENGTH(message)=47, JSON_LENGTH(reference)=23`
- 不变量: `len(reference) = assistant_count - 1`（开场白没引用，所以少 1）
- API 源码: `/ragflow/api/apps/sdk/session.py:609-660` `list_session()` while loop 没跳开场白
- 内容验证: 1-轮 session 的 `ref[0].chunks[4].content` 是 "理论设计炮点63750个..."，对应 a1 答案里 `[ID:4]` → 证实"挂在开场白上的实际是 a1 的真实 reference"
