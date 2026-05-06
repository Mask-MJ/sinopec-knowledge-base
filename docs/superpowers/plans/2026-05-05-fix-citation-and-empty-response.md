# Fix Citation Reference Persistence & Empty-Response Pollution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复历史会话点击 `[N]` 引用永远显示"该消息未携带引用数据"的 bug，并删除 prompt 里导致模型在已成功作答时仍追加"知识库中未找到您要的答案！"的冗余规则。

**Architecture (修订自 Task 1 recon):** RAGFlow 实际把引用数据**内嵌**在每条 assistant message 的 `reference` 字段，但格式是**扁平 chunk 数组**而非前端期望的 `{ chunks, doc_aggs }` 对象。当前 `AssistantService.findAllSessions` 直接透传，OpenAPI schema 标的 `SessionMessageEntity.reference?: ReferenceEntity` 类型与运行时不符，前端 `Reference` 类型也不匹配，导致历史会话的 `messages[i].reference` 被前端读成无效结构 → 点 [N] 永远显示"未携带引用数据"。本次修复在服务端透传时加纯函数 `normalizeMessageReference`，把扁平 chunk 数组包装成 `{ chunks: [...], doc_aggs: derived }`（doc_aggs 从 chunks 按 document_name 聚合派生），前端零改动即可继续吃同一套 `Reference` 渲染。同时把 KB prompt 里冗余且会被模型过度遵守的"必须输出空回复语句"规则删除，依赖 RAGFlow 内置的 `empty_response`。

**RAGFlow 实测 Quirks（必须容错）:**
1. `messages[0]`（开场白）也带 `reference[6]` —— 与任何具体回答无关，前端不会在开场白渲染 [ID:N]，所以保留与丢弃皆可，简单起见保留。
2. 最新一条 assistant message 偶发 `reference` 字段缺失（RAGFlow 持久化时 race condition），server transform 必须把 `undefined` 映射为 `undefined`，不要崩。

**Tech Stack:** NestJS + Vitest（server unit test），TypeScript ts-rest 风格 SessionEntity，OpenAPI 自动生成（`pnpm -F @sinopec-kb/client openapi`）。

---

## File Structure

| 路径 | 责任 | 改动类型 |
|------|------|----------|
| [apps/server/src/modules/assistant/assistant.service.ts](apps/server/src/modules/assistant/assistant.service.ts) | 透传 session、normalize reference、构造 KB prompt | Modify |
| `apps/server/src/modules/assistant/normalize-reference.ts` | 纯函数 `normalizeMessageReference` + 类型 | **Create** |
| `apps/server/src/modules/assistant/normalize-reference.spec.ts` | 配对函数单测（含 RAGFlow quirks） | **Create** |
| `apps/server/src/modules/assistant/assistant.service.spec.ts` | KB prompt 不含禁用兜底语句 + 透传 normalize 集成 | **Create** |
| [apps/server/src/modules/assistant/assistant.entity.ts](apps/server/src/modules/assistant/assistant.entity.ts) | 保持 `SessionMessageEntity.reference?` 字段 | 不变（已存在） |
| `apps/server/src/metadata.ts` | SWC 生成的 swagger metadata | 重新生成 |
| `apps/client/types/openapi.d.ts` | 前端 OpenAPI 类型 | 重新生成 |
| `.changeset/fix-citation-reference-normalize.md` | 版本变更记录 | **Create** |
| `.changeset/strip-empty-response-rule-from-prompt.md` | 版本变更记录 | **Create** |

> 前端代码不需要改动 —— 服务端 normalize 后，`useChat.initMessages` 读到的 `item.reference` 就是 `{chunks, doc_aggs}`，现有 `Reference` 类型与渲染逻辑完全适用。

---

## Task 1: 用真实 RAGFlow 实例确认 session.reference 结构

**Why this exists:** 整个修复方向依赖一个假设：RAGFlow 的 session list API 把 `reference` 放在 session 顶层，且数组元素与"已完成 assistant 答复"按时间顺序一一对应。文档示例里 `reference: []` 是空的，必须用真实运行中的 RAGFlow 实例（已有 Q-A 历史的 session）确认结构后才能开始 TDD。

**Files:**
- 仅 recon，不改代码

- [ ] **Step 1: 选一个有 ≥2 轮 Q-A 历史的 session 做实测**

读取 `apps/server/scripts/eval/configs/B2-keywords.json` 拿到一个真实的 `assistantId`（如 `91a25496482311f1a9b8932ed31a3307`）；从 `apps/server/.env.eval` 或 `apps/server/.env` 读取 `RAGFLOW_HOST` 和 `RAGFLOW_API_KEY`。

如果没有现成 session，先 `POST /api/v1/chats/{assistantId}/sessions` 建会话，用 `POST /api/v1/chats/{assistantId}/completions`（非流式）连发两个能命中知识库的问题。

- [ ] **Step 2: GET sessions 列表，dump 完整响应**

```bash
ASSISTANT_ID="<填上面 assistantId>"
curl -sS "$RAGFLOW_HOST/api/v1/chats/$ASSISTANT_ID/sessions?page=1&page_size=5" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  | jq '.data[0]' > /tmp/ragflow-session-shape.json
cat /tmp/ragflow-session-shape.json | jq 'keys'
cat /tmp/ragflow-session-shape.json | jq '.messages | length'
cat /tmp/ragflow-session-shape.json | jq '.reference | length'
cat /tmp/ragflow-session-shape.json | jq '.reference[0] | keys'
cat /tmp/ragflow-session-shape.json | jq '.messages[] | {role, has_ref: (.reference != null)}'
```

Expected：
- `keys` 含 `messages`、`reference`，且 `reference` 是顶层数组（不嵌在 message 里）
- `reference.length` == "完成的 Q-A 轮数"（即 assistant 消息数减开场白）
- `reference[i] | keys` 含 `chunks`、`doc_aggs`
- `messages[].has_ref` 全为 false（消息不含 reference 字段）

- [ ] **Step 3: 把实测结构记录在 plan 末尾的 "Recon Findings" 小节**

在本 plan 文件末尾追加一个小节，记录：
- `reference[]` 的实际类型
- 与 assistant 消息的位置对应关系（是按"非 opener 的 assistant 顺序"还是其他规则）
- 是否存在 `messages[i].reference` 字段（兜底分支）

> ⚠️ 如果实测发现 RAGFlow 把 reference 放进了 message 里（与文档不符，可能新版本变了），停止执行此 plan，重新评估方案 —— 直接读 `messages[i].reference` 就够了，不需要配对逻辑。

- [ ] **Step 4: 不需要 commit（此任务只产出认知）**

---

## Task 2: 创建 normalize 纯函数 `normalizeMessageReference`（红）

**Files:**
- Create: `apps/server/src/modules/assistant/normalize-reference.ts`
- Test: `apps/server/src/modules/assistant/normalize-reference.spec.ts`

- [ ] **Step 1: 写失败测试 —— 覆盖 RAGFlow 实测 quirks**

新建 `apps/server/src/modules/assistant/normalize-reference.spec.ts`：

```typescript
import { describe, expect, it } from 'vitest';

import {
  normalizeMessageReferences,
  type RagflowChunk,
  type RagflowRawMessage,
} from './normalize-reference';

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

describe('normalizeMessageReferences', () => {
  it('wraps a flat chunk array into { chunks, doc_aggs }', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1 [ID:0]',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
        ],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]?.reference).toEqual({
      chunks: [
        chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
      ],
      doc_aggs: [{ doc_id: 'doc-A', doc_name: 'A.docx', count: 1 }],
    });
  });

  it('aggregates doc_aggs by document_id and counts chunks per document', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1',
        reference: [
          chunk({ id: 'c1', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c2', document_id: 'doc-A', document_name: 'A.docx' }),
          chunk({ id: 'c3', document_id: 'doc-B', document_name: 'B.docx' }),
        ],
      },
    ];
    const result = normalizeMessageReferences(raw);
    expect(result[0]?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('drops reference field when absent (RAGFlow streaming-truncated message)', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'truncated' },
    ];
    expect(normalizeMessageReferences(raw)[0]).not.toHaveProperty('reference');
  });

  it('drops reference field when array is empty', () => {
    const raw: RagflowRawMessage[] = [
      { role: 'assistant', content: 'no refs', reference: [] },
    ];
    expect(normalizeMessageReferences(raw)[0]).not.toHaveProperty('reference');
  });

  it('passes user messages through untouched', () => {
    const raw: RagflowRawMessage[] = [{ role: 'user', content: 'q1' }];
    expect(normalizeMessageReferences(raw)[0]).toEqual({
      role: 'user',
      content: 'q1',
    });
  });

  it('does not mutate the input array', () => {
    const raw: RagflowRawMessage[] = [
      {
        role: 'assistant',
        content: 'a1',
        reference: [chunk({ id: 'c1' })],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(raw));
    normalizeMessageReferences(raw);
    expect(raw).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/normalize-reference.spec.ts
```

Expected：FAIL — `Cannot find module './normalize-reference'`。

- [ ] **Step 3: 不 commit（红阶段产物，等绿了一起 commit）**

---

## Task 3: 实现 `normalizeMessageReferences`（绿）

**Files:**
- Create: `apps/server/src/modules/assistant/normalize-reference.ts`

- [ ] **Step 1: 创建文件，写最小实现让测试通过**

`apps/server/src/modules/assistant/normalize-reference.ts`：

```typescript
import type {
  ReferenceChunkEntity,
  ReferenceDocAggEntity,
  ReferenceEntity,
} from './assistant.entity';

/** RAGFlow 持久化的 chunk 类型 = 我们的 ReferenceChunkEntity 形状一致 */
export type RagflowChunk = ReferenceChunkEntity;

/** RAGFlow GET /sessions 返回的原始 message — reference 是扁平 chunk 数组 */
export interface RagflowRawMessage {
  content: string;
  reference?: RagflowChunk[];
  role: string;
}

/** Normalize 后的 message — reference 是前端期望的 { chunks, doc_aggs } */
export interface NormalizedMessage {
  content: string;
  reference?: ReferenceEntity;
  role: string;
}

/**
 * 把 RAGFlow GET /sessions 返回的扁平 chunk 数组规范成前端期望的
 * `{ chunks, doc_aggs }` 形态。
 *
 * RAGFlow 持久化格式（实测 v0.x）：`messages[i].reference: ReferenceChunkEntity[]`
 * SSE 流式格式：`reference: { chunks, doc_aggs }`
 * 前端 `Reference` 类型按 SSE 格式建模，要让历史会话也能用同一套渲染，
 * server 在透传层做格式归一：从 chunks 按 document_id 派生 doc_aggs。
 *
 * 容错：
 * - reference 字段缺失 / 为空数组 → drop（不输出 reference 键）
 * - user 消息 → 透传不动
 *
 * 该函数是纯函数，不修改入参。
 */
export function normalizeMessageReferences(
  messages: ReadonlyArray<RagflowRawMessage>,
): NormalizedMessage[] {
  return messages.map((msg) => {
    const { reference, ...rest } = msg;
    if (!reference || reference.length === 0) {
      return { ...rest };
    }
    return { ...rest, reference: buildReferenceEntity(reference) };
  });
}

function buildReferenceEntity(chunks: RagflowChunk[]): ReferenceEntity {
  const aggMap = new Map<string, ReferenceDocAggEntity>();
  for (const c of chunks) {
    const existing = aggMap.get(c.document_id);
    if (existing) {
      existing.count += 1;
    } else {
      aggMap.set(c.document_id, {
        doc_id: c.document_id,
        doc_name: c.document_name,
        count: 1,
      });
    }
  }
  return {
    chunks: [...chunks],
    doc_aggs: [...aggMap.values()],
  };
}
```

- [ ] **Step 2: 运行测试，确认全绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/normalize-reference.spec.ts
```

Expected：6 tests passed。

- [ ] **Step 3: commit（红绿一并）**

```bash
git add apps/server/src/modules/assistant/normalize-reference.ts \
        apps/server/src/modules/assistant/normalize-reference.spec.ts
git commit -m "$(cat <<'EOF'
feat(@sinopec-kb/server): ✨ add normalize-reference helper for RAGFlow sessions

RAGFlow GET /sessions 持久化的 reference 是扁平 chunk[] 数组，前端 Reference
类型按 SSE 流式格式建模为 { chunks, doc_aggs }。新增纯函数 normalizeMessageReferences
在透传层做格式归一：从 chunks 按 document_id 派生 doc_aggs，缺失/空数组时丢弃 reference
字段，user 消息透传。为后续接入 findAllSessions 修复历史会话引用做准备。
EOF
)"
```

---

## Task 4: 在 `findAllSessions` 接入 normalize（红）

**Files:**
- Modify: [apps/server/src/modules/assistant/assistant.service.ts:325-344](apps/server/src/modules/assistant/assistant.service.ts#L325-L344)
- Test: `apps/server/src/modules/assistant/assistant.service.spec.ts`

- [ ] **Step 1: 写失败测试 —— assistant.service.spec.ts**

新建 `apps/server/src/modules/assistant/assistant.service.spec.ts`：

```typescript
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { RagflowService } from '@/common/ragflow/ragflow.service';
import {
  createMockActiveUser,
  createMockPrismaService,
} from '@/test-utils/mock.factory';

import { AssistantService } from './assistant.service';

const fakeChunk = (id: string, docId = 'doc-X', docName = 'X.docx') => ({
  id,
  content: `chunk-${id}`,
  dataset_id: 'd1',
  doc_type: '',
  document_id: docId,
  document_name: docName,
  image_id: '',
  positions: [],
  similarity: 0.9,
  term_similarity: 0.5,
  url: null,
  vector_similarity: 0.7,
});

describe('assistantService.findAllSessions', () => {
  let service: AssistantService;
  const ragflow = { request: vi.fn() };
  const prisma = createMockPrismaService();

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PRISMA_SERVICE_TOKEN, useValue: prisma },
        { provide: RagflowService, useValue: ragflow },
        { provide: ConfigService, useValue: { get: () => 'test-model' } },
      ],
    }).compile();
    service = module.get(AssistantService);

    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      assistantId: 'rf-1',
    });
  });

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
    const msgs = result[0]!.messages;
    const a1 = msgs[2];
    expect(a1?.reference?.chunks).toHaveLength(3);
    expect(a1?.reference?.doc_aggs).toEqual([
      { doc_id: 'doc-A', doc_name: 'A.docx', count: 2 },
      { doc_id: 'doc-B', doc_name: 'B.docx', count: 1 },
    ]);
  });

  it('drops reference field for assistant messages where RAGFlow truncated persistence', async () => {
    ragflow.request.mockResolvedValue([
      {
        id: 's2',
        chat_id: 'rf-1',
        name: '截断会话',
        messages: [
          { role: 'assistant', content: '你好！' },
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'truncated' }, // RAGFlow 没持久化 reference
        ],
      },
    ]);

    const result = await service.findAllSessions(1, createMockActiveUser(), {});
    expect(result[0]!.messages[2]).not.toHaveProperty('reference');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/assistant.service.spec.ts
```

Expected：第一个测试 FAIL（`a1.reference.chunks` 是 chunk 数组而非 wrapper），第二个 PASS（侥幸通过）。

---

## Task 5: 在 service 里调用 normalize helper（绿）

**Files:**
- Modify: [apps/server/src/modules/assistant/assistant.service.ts](apps/server/src/modules/assistant/assistant.service.ts)

- [ ] **Step 1: 把 findAllSessions 改造为先透传再 normalize**

找到 [apps/server/src/modules/assistant/assistant.service.ts:325-344](apps/server/src/modules/assistant/assistant.service.ts#L325-L344) 的 `findAllSessions`，把 RAGFlow 响应类型化、把每个 session 的 messages 用 helper normalize。

Replace：

```typescript
  async findAllSessions(
    id: number,
    user: ActiveUserData,
    dto: QuerySessionDto,
  ) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    return this.ragflow.request(
      'GET',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        page: dto.page ?? 1,
        page_size: dto.pageSize ?? 30,
        user_id: String(user.sub),
        name: dto.name,
      },
    );
  }
```

With：

```typescript
  async findAllSessions(
    id: number,
    user: ActiveUserData,
    dto: QuerySessionDto,
  ) {
    const assistant = await this.prisma.client.assistant.findUniqueOrThrow({
      where: { id },
    });

    const sessions = await this.ragflow.request<RagflowSessionRaw[]>(
      'GET',
      `/api/v1/chats/${assistant.assistantId}/sessions`,
      {
        page: dto.page ?? 1,
        page_size: dto.pageSize ?? 30,
        user_id: String(user.sub),
        name: dto.name,
      },
    );

    return sessions.map((s) => ({
      ...s,
      messages: normalizeMessageReferences(s.messages ?? []),
    }));
  }
```

- [ ] **Step 2: 在文件顶部加 import 与本地类型**

在文件顶部 import 区追加：

```typescript
import {
  normalizeMessageReferences,
  type RagflowRawMessage,
} from './normalize-reference';
```

并在文件底部 `// ─── Private Helpers ──────────────────────────────` 上方加本地类型（与 RAGFlow 顶层响应对齐）：

```typescript
interface RagflowSessionRaw {
  chat_id: string;
  create_date: string;
  id: string;
  messages: RagflowRawMessage[];
  name: string;
  update_date: string;
}
```

> 注意 RAGFlow 顶层字段是 snake_case（`chat_id`、`create_date`），与现有 `SessionEntity`（camelCase）不一致 —— 这是另一个独立问题，在本 PR 范围之外。`normalizeMessageReferences` 只关心 `messages` 字段。

- [ ] **Step 3: 跑测试，确认绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/assistant.service.spec.ts
```

Expected：2 tests passed。

- [ ] **Step 4: 跑 typecheck**

```bash
pnpm -F @sinopec-kb/server typecheck
```

Expected：no errors。

- [ ] **Step 5: commit**

```bash
git add apps/server/src/modules/assistant/assistant.service.ts \
        apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(@sinopec-kb/server): 🐛 normalize RAGFlow per-message reference into { chunks, doc_aggs }

RAGFlow GET /sessions 持久化的 messages[i].reference 是扁平 chunk 数组，与前端
按 SSE 流式格式建模的 Reference = { chunks, doc_aggs } 类型不匹配，导致历史
会话点击 [N] 引用永远显示"该消息未携带引用数据"。在透传层调用
normalizeMessageReferences 包装成前端期望形态，doc_aggs 从 chunks 按 document_id
聚合派生，前端零改动即可恢复引用浮窗。
EOF
)"
```

---

## Task 6: 删除 KB prompt 里冗余的"必须输出空回复语句"规则（红）

**Why this exists:** [apps/server/src/modules/assistant/assistant.service.ts:46](apps/server/src/modules/assistant/assistant.service.ts#L46) 第 5 条规则强制模型在「全部知识库内容无关」时输出 `知识库中未找到您要的答案！`。模型把它当兜底语过度执行，即使已成功回答也追加这句。RAGFlow 的 `empty_response` 配置（service 第 87 行）是干这个用的内置兜底，prompt 里再强制等于双重保险并产生副作用 —— 删掉。

**Files:**
- Modify: [apps/server/src/modules/assistant/assistant.service.ts:46](apps/server/src/modules/assistant/assistant.service.ts#L46)
- Test: `apps/server/src/modules/assistant/assistant.service.spec.ts`（继续追加）

- [ ] **Step 1: 在 spec 里追加 prompt 结构测试**

在 `apps/server/src/modules/assistant/assistant.service.spec.ts` 末尾追加：

```typescript
describe('AssistantService KB prompt template', () => {
  it('does not instruct the model to emit "知识库中未找到您要的答案" — that role is owned by RAGFlow empty_response', () => {
    // KB_CHAT_PROMPT 是 private static — 通过反射访问，避免暴露公共字段
    const prompt = (AssistantService as unknown as { KB_CHAT_PROMPT: string })
      .KB_CHAT_PROMPT;
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain('知识库中未找到您要的答案');
    expect(prompt).toContain('知识库未给出'); // 仍保留"不编造、未给出就说未给出"的语义
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/assistant.service.spec.ts -t 'KB prompt template'
```

Expected：FAIL — 当前 prompt 包含禁用句。

---

## Task 7: 改 KB_CHAT_PROMPT，移除冗余规则（绿）

**Files:**
- Modify: [apps/server/src/modules/assistant/assistant.service.ts:39-51](apps/server/src/modules/assistant/assistant.service.ts#L39-L51)

- [ ] **Step 1: 把规则 5 改为只保留"未给出就说未给出"，删除强制输出兜底句**

Replace（第 39-51 行 KB_CHAT_PROMPT 数组）:

```typescript
  /** 关联知识库时的默认系统提示词（针对中石化勘探技术报告场景） */
  private static readonly KB_CHAT_PROMPT = [
    '你是中石化勘探技术报告专业助手。根据知识库内容回答问题，遵守以下规则：',
    '',
    '1. **列举类问题必须完整**：当用户问"哪些参数 / 主要参数 / 工作量包括 / 影响因素有哪些 / 包括..等"时，必须列出知识库中提及的**全部条目**，不要省略。',
    '2. **数字必须精确严格**：所有数字（井号、坐标、限差、面积、覆盖次数、炮数、控制点编号等）必须照实给出，包含正负号和单位。',
    '3. **区分试验段 vs 全工区**：当问"实际生产 / 总数 / 全项目"时，必须找**全工区/全项目的汇总数据**；问"试验段 / 局部"才用试验段数据。如果两者在知识库中都有，必须**分别回答**并明确区分。',
    '4. **多文档汇总**：同一项目跨多份文档（如工程设计 + 测量施工总结 + 试验报告），需要从多源汇总，不要遗漏。',
    '5. **不知道就说不知道**：知识库未提及的事实绝不编造，明确说"知识库未给出"。',
    '6. **回答结构化**：使用编号列表、bullet point 或表格，便于核对每个数据点。',
    '',
    '知识库内容：',
    '{knowledge}',
  ].join('\n');
```

> 删掉的句子是：`当所有知识库内容都与问题无关时，你的回答必须包括"知识库中未找到您要的答案！"这句话。` —— 该兜底由 RAGFlow `empty_response` 在检索为空时自动接管，不再由 LLM 介入。

- [ ] **Step 2: 跑测试，确认绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/assistant.service.spec.ts
```

Expected：所有用例 PASS（含原有 4 个 + 新增 1 个共 5 个）。

- [ ] **Step 3: commit**

```bash
git add apps/server/src/modules/assistant/assistant.service.ts \
        apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(@sinopec-kb/server): 🐛 stop forcing LLM to emit empty-response sentence in KB prompt

KB_CHAT_PROMPT 第 5 条强制模型在"全部知识库无关"时输出"知识库中未找到您要的答案！"，
模型把它当兜底语过度执行，已成功回答时也追加。删掉该指令；RAGFlow 内置
empty_response 在召回为空时已接管同一兜底，无需 LLM 复述。
EOF
)"
```

---

## Task 8: 写 changeset

**Files:**
- Create: `.changeset/fix-citation-reference-pairing.md`
- Create: `.changeset/strip-empty-response-rule-from-prompt.md`

- [ ] **Step 1: 创建第一个 changeset**

`.changeset/fix-citation-reference-normalize.md`：

```markdown
---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 修复历史会话点击引用永远显示"未携带引用数据"

- RAGFlow `GET /api/v1/chats/{id}/sessions` 持久化的 `messages[i].reference` 是扁平 chunk 数组，与前端按 SSE 流式格式建模的 `Reference = { chunks, doc_aggs }` 类型不匹配。
- 在 `AssistantService.findAllSessions` 透传层调用新增 `normalizeMessageReferences` 纯函数，把 chunk 数组包装成 `{ chunks, doc_aggs }`，doc_aggs 从 chunks 按 `document_id` 聚合派生，前端零改动恢复引用浮窗。
- 新增 `normalize-reference.ts` 与单测覆盖（doc_aggs 派生 / 缺失字段 / 空数组 / user 透传 / 不可变入参）。
```

- [ ] **Step 2: 创建第二个 changeset**

`.changeset/strip-empty-response-rule-from-prompt.md`：

```markdown
---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 删除 KB prompt 里强制输出空回复句的指令

- `KB_CHAT_PROMPT` 第 5 条原要求 LLM 在"全部知识库无关"时输出 `"知识库中未找到您要的答案！"`，模型把它当兜底语过度执行，已成功回答时也会追加。
- 删掉该指令，统一交由 RAGFlow `empty_response` 配置在召回为空时自动兜底，避免 LLM 介入的副作用。
- 第 5 条改为只保留"未提及的事实绝不编造、明确说未给出"的语义，新增 spec 锁定 prompt 不含禁用句。
```

- [ ] **Step 3: commit**

```bash
git add .changeset/fix-citation-reference-normalize.md \
        .changeset/strip-empty-response-rule-from-prompt.md
git commit -m "chore(@sinopec-kb/server): 🔨 add changesets for citation normalize & prompt cleanup"
```

---

## Task 9: 重新生成 OpenAPI 类型与 Swagger metadata

**Files:**
- Regenerate: `apps/server/src/metadata.ts`
- Regenerate: `apps/client/types/openapi.d.ts`

- [ ] **Step 1: 启动 server（后台）**

```bash
pnpm dev:server
```

> 等到日志出现 `Application is running on: http://[::1]:3001` 再继续下一步。

- [ ] **Step 2: 重新生成 client OpenAPI 类型**

```bash
pnpm -F @sinopec-kb/client openapi
```

Expected：`apps/client/types/openapi.d.ts` 被更新（如果服务端类型有变化）。

- [ ] **Step 3: 检查 typecheck**

```bash
pnpm check:type
```

Expected：no errors。

- [ ] **Step 4: 停掉 server，commit（如果有变化）**

```bash
git status apps/client/types/openapi.d.ts apps/server/src/metadata.ts
```

如果有 diff：

```bash
git add apps/client/types/openapi.d.ts apps/server/src/metadata.ts
git commit -m "chore: 🔨 regenerate openapi types and swagger metadata after session schema fix"
```

如果没有 diff（schema 实际未变，因为 SessionMessageEntity.reference? 字段早就在），跳过 commit。

---

## Task 10: 端到端验证（手动）

**Why this exists:** 单测覆盖了配对纯函数和透传层，但前端"刷新页面后引用浮窗仍能弹出"必须靠浏览器实际验证。

**Files:**
- 不改代码

- [ ] **Step 1: 启动前后端**

```bash
pnpm docker:dev
pnpm dev
```

- [ ] **Step 2: 访问助手聊天页**

打开 http://localhost:3100/assistant/chat/{某个有知识库关联的 assistantId}（如截图里的 `/assistant/chat/3`）。

- [ ] **Step 3: 复现原始问题，验证修复后的行为**

操作清单：

1. 创建一个会话，提问 `2024年顺北21井三维项目的设计炮数是多少？实际生产总炮数是多少？`
2. 等流式响应结束，点击答案中的 `[N]` 上标 —— 应弹出文档名/相似度/原文片段（live streaming 路径）。
3. **关键步骤：F5 刷新页面**，再次回到同一会话。
4. 再次点击同一条消息的 `[N]` —— 应仍然弹出引用片段，**不应**显示"该消息未携带引用数据"。
5. 检查答案文末：在能正确作答的问题里，**不应**出现"知识库中未找到您要的答案！"这句话。

- [ ] **Step 4: 截屏存档（可选）**

把 step 4 的浮窗截图与 step 5 的文末截图存到 `docs/superpowers/plans/2026-05-05-fix-citation-and-empty-response.evidence/` 作为 PR 描述附件。

- [ ] **Step 5: 不需要 commit**

---

## Task 11: 推送、等 CI 绿

**Files:**
- 不改代码

- [ ] **Step 1: 推到当前分支**

```bash
git push
```

- [ ] **Step 2: 监控 CI（强制等待）**

按 [common/development-workflow.md](https://example.invalid) 6. "Wait for CI After Push" 规则，进入"等 CI 绿"状态：先用 `mcp__gitea__actions_run_read`（如可用）或 `gh run list --limit 1` / `curl` Gitea API 拉最近一次 commit 的 status。

- [ ] **Step 3: CI 红了 → 自己拉日志、定位、修、重 push、再等**

不要把监控 CI 的负担甩给用户。

- [ ] **Step 4: CI 绿了 → propose 下一步**

询问用户是否要开 PR / squash merge / 部署。

---

## Recon Findings (Task 1 — 2026-05-05 实测于 RAGFlow v0.x localhost:9380)

实测 47 条多轮 session（assistant `b7e94c58476611f1a9b8932ed31a3307` / session `be2252e0476611f1a9b8932ed31a3307`）：

1. **session 顶层无 `reference` 字段**。返回 keys 仅含 `chat_id, create_date, create_time, id, messages, name, update_date, update_time, user_id`。原 plan 假设的"按下标配对"方案完全不适用。
2. **`messages[i].reference` 内嵌**，每条 assistant 答复有自己独立的 6 条 chunks，互不相同（已对比 messages[2] vs messages[6] 的 chunk id 集合，零交集）。
3. **格式是扁平 `RagflowChunk[]` 数组**，**不是** `{ chunks, doc_aggs }` 包装。chunk 字段：`id, content, dataset_id, doc_type, document_id, document_name, image_id, positions, similarity, term_similarity, url, vector_similarity` —— 与 `ReferenceChunkEntity` 完全对齐。
4. **Quirk 1**: `messages[0]`（开场白）也带 reference[6]，content 与开场白文字完全无关。属于 RAGFlow 持久化 bug。**无害**（开场白文本里没有 [ID:N] 标记，前端不会渲染引用），保留与丢弃皆可，简单起见保留。
5. **Quirk 2**: 多轮 session 中，**最新一条 assistant 偶发 `reference` 字段缺失**（`messages[46]` 即截图里那一轮，`has_ref: false`）。RAGFlow 持久化 race condition。`normalizeMessageReferences` 必须容错（缺失 → drop reference 字段，不崩）。
6. `GET /api/v1/chats/{id}/sessions/{session_id}` 单 session 端点**不存在**（返回 405 Method Not Allowed）。只能用 LIST endpoint。

**结论**：原 plan 的 `pairReferencesWithMessages` 方案作废。改为 `normalizeMessageReferences`（包装 chunk 数组、派生 doc_aggs）。前端类型契约不变。

---

## Self-Review Checklist

- [x] 每个 task 都给出实际文件路径与可粘贴的代码块，无 TBD/TODO
- [x] 所有命令含期望输出（PASS / FAIL / 错误信息）
- [x] 类型一致性：`PairedMessage`、`RagflowMessage`、`RagflowReference` 在 Task 2/3/5 之间统一
- [x] 每个修改步骤都有 TDD 顺序：先红后绿；KB prompt 改动也有 spec 锁定
- [x] 提交粒度：4 个 commit（helper / 配对接入 / prompt 改动 / changeset），符合"frequent commits"
- [x] 覆盖原 spec 两个问题：① 历史会话引用丢失（Task 2-5、9-10）② 兜底句污染（Task 6-8、10）
- [x] 没有依赖 hypothetical 接口或字段：`SessionMessageEntity.reference?` 已存在，`empty_response` 已配置
- [x] 端到端验证步骤（Task 10）确实复现原始 bug 场景
