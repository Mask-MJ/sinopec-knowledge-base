# Align Assistant Settings With RAGFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把项目内"聊天助手"的设置项对齐 RAGFlow 0.24 后台的全部核心字段（含 Rerank 模型），让"测试 2"等线上助手能从本项目 UI 直接配置 rerank、关键词检索、知识图谱、显示引文、多轮优化、跨语言搜索，不再需要登 RAGFlow 后台。

**Architecture:**

- 后端：在 `Assistant` Prisma 模型 + `CreateAssistantDto` + `AssistantService.create/update` 三处同步增加 6 个字段（`rerankId` / `keyword` / `useKnowledgeGraph` / `refineMultiturn` / `showQuote` / `crossLanguages`）。映射经 RAGFlow `web/src/interfaces/database/chat.ts` 的 `PromptConfig` 接口与 `web/src/components/rerank.tsx` 的 `rerankFormSchema` 实证：**只有 `rerankId` 走 RAGFlow body 顶层**，`keyword` / `useKnowledgeGraph` / `refineMultiturn` / `showQuote` / `crossLanguages` **全部都进 `prompt_config` 嵌套**。
- 前端：扩展现有 `useLlmOptions` composable 的 `modelType` 联合类型加 `'rerank'`（不新建 composable，遵循 library-preference.md），抽屉表单补齐截图字段。
- 数据：用 service 自身 `update()` API 把线上"测试 2"（assistantId `c52e3c2a487e11f1a9b8932ed31a3307`）的 `rerankId` 设为 `BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible`——直接走 UI 抽屉点保存即可，不需要一次性脚本。

**Tech Stack:** NestJS / Prisma 6 + PostgreSQL / class-validator / RAGFlow 0.24 HTTP API / Vue 3 + pro-naive-ui / vitest。

**TDD Discipline:** 每个实现 Task 前都有一个 RED spec Task；TDD 验证后再写实现，最后 GREEN。一切核心改动（`toPromptConfig` / `create` / `createGeneral` / `update` 含 partial / DB 回滚分支）都先有断言。

**PR 拆分（按 git-workflow.md 跨域拆分原则）：**

- **PR 1 — Server**：Tasks 1-13（Prisma migration + DTO + Service + spec + verification）
- **PR 2 — Client**：Tasks 14-19（OpenAPI 重生成 + i18n + 表单 + 抽常量），base = PR1 merge commit
- **PR 3 — Eval**：Tasks 20-22（rerank 对照 config + dev/holdout 跑数）

**Out of scope（列入 follow-up issue，不在本 plan 内做）：**

- TTS 文本转语音（`prompt_config.tts`）
- PageIndex（截图存在，RAGFlow 0.24 源码无对应字段，先调研）
- Tavily API Key（`prompt_config.tavily_api_key`）
- `meta_data_filter` 元数据过滤
- `parameters` 变量自定义
- Freedom 自由度 preset
- `prompt_config.reasoning`、`prompt_config.toc_enhance`
- `keywordsSimilarityWeight` rename + migration（破坏性；本 plan 仅加 spec 验证语义无翻转）
- `useLlmOptions` 现有 catch 缺 `console.error`（silent failure，独立修复）
- `update()` 二次失败用 outbox/saga 替代 logger（架构级改造）
- 抽屉表单的 Playwright E2E（覆盖范围较大，独立 PR）
- Rerank 启用后 RAGFlow UI 仅在选中 rerank 模型时显示 top_k 滑块（条件渲染对齐）

---

## File Structure

**Server (PR 1)**

| 文件 | 操作 | 责任 |
| --- | --- | --- |
| `apps/server/prisma/models/assistant.prisma` | Modify | Assistant 模型加 6 个字段 |
| `apps/server/prisma/migrations/<TS>_assistant_align_with_ragflow/migration.sql` | Create | 字段迁移 SQL |
| `apps/server/src/modules/assistant/assistant.dto.ts` | Modify | `CreateAssistantDto` 加 6 个字段 |
| `apps/server/src/modules/assistant/assistant.entity.ts` | Modify | `AssistantEntity` 加 6 个字段 |
| `apps/server/src/modules/assistant/prompt-config.types.ts` | Create | 显式 `ToPromptConfigInput` 与 `PromptConfig` interface（不再 `Record<string, unknown>`） |
| `apps/server/src/modules/assistant/assistant.service.ts` | Modify | `create/createGeneral/update` 同步新字段，`toPromptConfig` 改用显式 interface |
| `apps/server/src/modules/assistant/assistant.service.spec.ts` | Modify | RED-first：6 个新 case 覆盖 toPromptConfig / create / createGeneral / update partial / 回滚 / weight 透传 |
| `.changeset/align-assistant-settings.md` | Create | feat 类型 changeset（在第一个 feat commit 前建好，遵循 git-workflow.md） |

**Client (PR 2)**

| 文件 | 操作 | 责任 |
| --- | --- | --- |
| `apps/client/src/composables/useLlmOptions.ts` | Modify | type union 增加 `'rerank'` |
| `apps/client/src/types/openapi.d.ts` | Modify (auto) | `pnpm openapi` 重生成（前置先 `pnpm build` 让 SWC 出 `metadata.ts`） |
| `apps/client/src/constants/ragflow.ts` | Create | `CROSS_LANGUAGE_OPTIONS` 常量（注释指向 RAGFlow 源码） |
| `apps/client/src/views/assistant/chat/[id].page.vue` | Modify | 抽屉表单补齐字段（rerank 下拉、Top-K、模型、惩罚、最大 token、布尔 switch、跨语言多选）。每个 `pro-digit` 加 `step` / `min` / `max` |
| `apps/client/src/locales/langs/zh-CN/page/assistant.json` | Modify | 新字段中文 |
| `apps/client/src/locales/langs/en-US/page/assistant.json` | Modify | 新字段英文 |

**Eval (PR 3)**

| 文件 | 操作 | 责任 |
| --- | --- | --- |
| `apps/server/scripts/eval/configs/prod-test2-rerank.json` | Create | 对照基线的 rerank 实验配置 |

---

## Tasks

# ━━━ PR 1: Server ━━━

### Task 1: 建 changeset（feat 类型预登记）

按 git-workflow.md，feat 变更需要 changeset 在**第一个 feat commit 之前**建好（commitlint 检查 changeset 存在性时机）。

**Files:**

- Create: `.changeset/align-assistant-settings.md`

- [ ] **Step 1: 跑 changeset CLI 选 minor**

```bash
cd /root/code/sinopec-knowledge-base
pnpm changeset
```

交互：勾选 `@sinopec-kb/server` 与 `@sinopec-kb/client`，都选 `minor`，summary 填：

```
align assistant settings with RAGFlow (rerank/keyword/use_kg/refine_multiturn/quote/cross_languages)
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/
git commit -m "chore(@sinopec-kb): 🔨 add changeset for assistant ragflow alignment"
```

---

### Task 2: Prisma 模型加 6 个字段 + migration

**Files:**

- Modify: `apps/server/prisma/models/assistant.prisma`
- Create: `apps/server/prisma/migrations/<TS>_assistant_align_with_ragflow/migration.sql`

- [ ] **Step 1: 编辑 `assistant.prisma`，在 `datasetIds` 行下追加**

```prisma
  /// RAGFlow rerank 模型 ID（格式：model_name@provider，留空表示不启用 rerank）
  rerankId                 String?
  /// 是否启用关键词检索（写入 RAGFlow prompt_config.keyword）
  keyword                  Boolean  @default(false)
  /// 是否启用知识图谱检索（写入 prompt_config.use_kg）
  useKnowledgeGraph        Boolean  @default(false)
  /// 是否开启多轮对话优化（写入 prompt_config.refine_multiturn）
  refineMultiturn          Boolean  @default(true)
  /// 是否在回答中显示引用块（写入 prompt_config.quote）
  showQuote                Boolean  @default(true)
  /// 跨语言检索目标语言代码列表（写入 prompt_config.cross_languages）
  crossLanguages           String[] @default([])
```

- [ ] **Step 2: 跑 migration（个人 .env.local）**

```bash
cd /root/code/sinopec-knowledge-base/apps/server
pnpm exec dotenvx run --env-file=.env.local --env-file=.env -- \
  pnpm prisma migrate dev --name assistant_align_with_ragflow
```

预期：生成 `prisma/migrations/<TS>_assistant_align_with_ragflow/migration.sql`，并打印 `✔ Generated Prisma Client`。

- [ ] **Step 3: 校对 SQL（拒绝意外 DROP / RENAME）**

```bash
cat apps/server/prisma/migrations/*assistant_align_with_ragflow*/migration.sql
```

期望仅有 6 条 `ALTER TABLE "Assistant" ADD COLUMN ...`。出现任何 DROP / RENAME / 数据搬迁立刻停下排查。

- [ ] **Step 4: 类型检查**

```bash
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

预期：0 error（新字段已纳入 Prisma client 类型）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/models/assistant.prisma \
        apps/server/prisma/migrations/*assistant_align_with_ragflow*
git commit -m "feat(@sinopec-kb/server): ✨ add ragflow-aligned columns to assistant"
```

> ⚠️ **Migration 不可变规则（prisma-rules.md）**：本步骤产出的 `migration.sql` 一旦 apply（含本地 dev 库），就**视为只读**。如果 PR review 期间需要调整字段，必须**新建一个修复 migration**（如 `<TS>_assistant_align_followup`），不得 squash / amend 改原文件——sha256 漂移会让其他 dev 环境 `prisma migrate dev` 直接报 `modified after applied`。

---

### Task 3: 扩展 `CreateAssistantDto`

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.dto.ts`

- [ ] **Step 1: 在 `CreateAssistantDto` 内追加 6 个字段（按字母序）**

```typescript
  /**
   * 跨语言检索目标语言代码列表
   * @example ['en', 'zh']
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  crossLanguages?: string[] = [];

  /**
   * 是否启用关键词检索（写入 RAGFlow prompt_config.keyword）
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  keyword?: boolean = false;

  /**
   * 是否开启多轮对话优化
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  refineMultiturn?: boolean = true;

  /**
   * RAGFlow rerank 模型 ID（格式：model_name@provider）
   * @example 'BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible'
   */
  @IsOptional()
  @IsString()
  rerankId?: string;

  /**
   * 是否在回答中展示引用块
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  showQuote?: boolean = true;

  /**
   * 是否启用知识图谱检索
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  useKnowledgeGraph?: boolean = false;
```

- [ ] **Step 2: 类型检查**

```bash
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

预期：0 error。

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/assistant/assistant.dto.ts
git commit -m "feat(@sinopec-kb/server): ✨ add ragflow-aligned fields to assistant DTO"
```

---

### Task 4: 扩展 `AssistantEntity`

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.entity.ts`

- [ ] **Step 1: 给 `AssistantEntity` 加 6 个字段（按字母序）**

```typescript
  /** 跨语言检索目标语言代码列表 */
  crossLanguages: string[];

  /** 是否启用关键词检索 */
  keyword: boolean;

  /** 是否开启多轮对话优化 */
  refineMultiturn: boolean;

  /** RAGFlow rerank 模型 ID */
  rerankId: null | string;

  /** 是否展示引用块 */
  showQuote: boolean;

  /** 是否启用知识图谱检索 */
  useKnowledgeGraph: boolean;
```

- [ ] **Step 2: 类型检查**

```bash
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

预期：0 error。

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/assistant/assistant.entity.ts
git commit -m "feat(@sinopec-kb/server): ✨ extend assistant entity with ragflow fields"
```

---

### Task 5: 显式 `PromptConfig` / `ToPromptConfigInput` 类型

**Files:**

- Create: `apps/server/src/modules/assistant/prompt-config.types.ts`

- [ ] **Step 1: 写新的类型文件**

```typescript
/**
 * RAGFlow `prompt_config` 嵌套结构（对齐 RAGFlow web/src/interfaces/database/chat.ts:4-17）。
 * 仅声明本项目用到的字段，未列入的（tts / tavily_api_key / reasoning / toc_enhance）见 plan follow-up。
 */
export interface PromptConfig {
  cross_languages: string[];
  empty_response: string;
  keyword: boolean;
  parameters: { key: string; optional: boolean }[];
  prologue: string;
  quote: boolean;
  refine_multiturn: boolean;
  system: string;
  use_kg: boolean;
}

/**
 * `toPromptConfig` 入参：业务侧字段（已解析默认值），不直接是 `Assistant` 实体——
 * `hasKnowledgeBase` 是派生值，且我们要在调用方用 partial DTO/旧值兜底。
 */
export interface ToPromptConfigInput {
  crossLanguages: string[];
  emptyResponse: string;
  hasKnowledgeBase: boolean;
  keyword: boolean;
  opener: string;
  prompt: string;
  refineMultiturn: boolean;
  showQuote: boolean;
  useKnowledgeGraph: boolean;
}
```

- [ ] **Step 2: 类型检查（应 0 error，文件未被引用，纯声明）**

```bash
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/assistant/prompt-config.types.ts
git commit -m "types(@sinopec-kb/server): 🏷️ add PromptConfig & ToPromptConfigInput interfaces"
```

---

### Task 6: 【RED】 spec — `toPromptConfig` 输出全部字段

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.spec.ts`

> Discipline：本 task 写测试且**让它失败**，下个 task 才写实现让它绿。

- [ ] **Step 1: 把 `toPromptConfig` 改为 `public static`（仅本 spec 期间，让测试能直接调）**

实际不动 service 代码，spec 通过反射访问 private 静态方法。先看 spec 当前如何访问：

```bash
grep -n "toPromptConfig\|AssistantService\\['" apps/server/src/modules/assistant/assistant.service.spec.ts | head
```

如果 spec 没引用过，新加访问形式：`(AssistantService as any).toPromptConfig(...)`。这是 spec 内部技术细节，不污染生产代码。

- [ ] **Step 2: 在 spec 末尾追加 describe 块**

```typescript
describe('AssistantService.toPromptConfig (RAGFlow PromptConfig 形状对齐)', () => {
  const baseInput = {
    prompt: 'sys',
    opener: 'hi',
    emptyResponse: 'no answer',
    hasKnowledgeBase: true,
    keyword: false,
    showQuote: true,
    useKnowledgeGraph: false,
    refineMultiturn: true,
    crossLanguages: [],
  };

  it('hasKnowledgeBase=true && showQuote=true → quote=true', () => {
    const out = (AssistantService as any).toPromptConfig(baseInput);
    expect(out).toMatchObject({
      system: 'sys',
      prologue: 'hi',
      empty_response: 'no answer',
      quote: true,
      keyword: false,
      use_kg: false,
      refine_multiturn: true,
      cross_languages: [],
      parameters: [{ key: 'knowledge', optional: false }],
    });
  });

  it('hasKnowledgeBase=false → quote 强制 false（即便 showQuote=true）', () => {
    const out = (AssistantService as any).toPromptConfig({
      ...baseInput,
      hasKnowledgeBase: false,
      showQuote: true,
    });
    expect(out.quote).toBe(false);
  });

  it('keyword=true 写入 prompt_config.keyword（不放顶层）', () => {
    const out = (AssistantService as any).toPromptConfig({
      ...baseInput,
      keyword: true,
    });
    expect(out.keyword).toBe(true);
  });

  it('crossLanguages 非空数组原样输出', () => {
    const out = (AssistantService as any).toPromptConfig({
      ...baseInput,
      crossLanguages: ['en', 'zh'],
    });
    expect(out.cross_languages).toEqual(['en', 'zh']);
  });
});
```

- [ ] **Step 3: 跑测试，确认 RED**

```bash
pnpm -F @sinopec-kb/server vitest run \
  src/modules/assistant/assistant.service.spec.ts
```

预期：4 个新 case 全部失败（当前 `toPromptConfig` 不输出 `keyword` / `use_kg` / `refine_multiturn` / `cross_languages`）。如果意外通过，停下排查测试是否真的命中。

- [ ] **Step 4: Commit RED**

```bash
git add apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "test(@sinopec-kb/server): ✅ add failing toPromptConfig spec for ragflow fields"
```

> 注：此 commit **测试失败但实现未动**——CI 会红。本 plan 默认在分支内推进，最终 PR 创建前所有测试都会绿（Task 7 让它们绿）。如果 CI 对 push 强制门禁，可把 Task 6+7 合并为单 commit；本 plan 倾向保留 RED-then-GREEN 两个 commit，便于 review 看 TDD 痕迹。

---

### Task 7: 【GREEN】 重写 `toPromptConfig` + 用新 input 接口

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.ts`

- [ ] **Step 1: import 新类型**

文件顶部 import 区追加：

```typescript
import type { PromptConfig, ToPromptConfigInput } from './prompt-config.types';
```

- [ ] **Step 2: 替换 `toPromptConfig` 实现**

把当前 91-102 行替换为：

```typescript
  private static toPromptConfig(resolved: ToPromptConfigInput): PromptConfig {
    return {
      system: resolved.prompt,
      prologue: resolved.opener,
      parameters: [{ key: 'knowledge', optional: false }],
      empty_response: resolved.emptyResponse,
      quote: resolved.showQuote && resolved.hasKnowledgeBase,
      keyword: resolved.keyword,
      use_kg: resolved.useKnowledgeGraph,
      refine_multiturn: resolved.refineMultiturn,
      cross_languages: resolved.crossLanguages,
    };
  }
```

- [ ] **Step 3: 跑测试，确认 4 个新 case 全绿；create/update 调用方应仍报 type error（缺参数）**

```bash
pnpm -F @sinopec-kb/server vitest run \
  src/modules/assistant/assistant.service.spec.ts
```

```bash
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

后者预期：报 `create()` / `createGeneral()` / `update()` 三处调用 `toPromptConfig` 缺参数。下一 Task 修。

- [ ] **Step 4: 暂不 commit**——下一 Task（Task 8 RED + Task 9 GREEN）会一起 commit `service.ts`，避免 broken-build commit。

---

### Task 8: 【RED】 spec — `create()` / `createGeneral()` 透传新字段

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.spec.ts`

- [ ] **Step 1: 在 spec 末尾追加 describe 块**

```typescript
describe('AssistantService.create / createGeneral (RAGFlow body 形状)', () => {
  // 假设 spec 顶部已经有 service / prisma / ragflow mock 工厂
  // 复用现有 fixture，只断言新增字段

  it('create: rerankId / keyword / use_kg / refine / quote / cross_languages 透传到 RAGFlow', async () => {
    prisma.client.assistant.create.mockResolvedValue({} as any);
    await service.create(
      { sub: 1 } as any,
      {
        name: 't',
        datasetIds: ['ds-1'],
        rerankId: 'BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible',
        keyword: true,
        useKnowledgeGraph: true,
        refineMultiturn: false,
        showQuote: false,
        crossLanguages: ['en'],
      } as any,
    );
    const postCall = ragflow.request.mock.calls.find(
      ([method, url]) => method === 'POST' && url === '/api/v1/chats',
    );
    expect(postCall).toBeDefined();
    const [, , body] = postCall!;
    expect(body.rerank_id).toBe(
      'BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible',
    );
    expect(body.keyword).toBeUndefined(); // 不在顶层
    expect(body.prompt_config.keyword).toBe(true);
    expect(body.prompt_config.use_kg).toBe(true);
    expect(body.prompt_config.refine_multiturn).toBe(false);
    // hasKnowledgeBase=true 但 showQuote=false → quote=false
    expect(body.prompt_config.quote).toBe(false);
    expect(body.prompt_config.cross_languages).toEqual(['en']);
  });

  it('createGeneral: 通用助手 prompt_config 全部默认（hasKnowledgeBase=false → quote=false）', async () => {
    prisma.client.assistant.findFirst.mockResolvedValue(null);
    prisma.client.assistant.create.mockResolvedValue({} as any);
    await service.createGeneral(1);
    const postCall = ragflow.request.mock.calls.find(
      ([method, url]) => method === 'POST' && url === '/api/v1/chats',
    );
    const [, , body] = postCall!;
    expect(body.prompt_config.quote).toBe(false);
    expect(body.prompt_config.keyword).toBe(false);
    expect(body.prompt_config.use_kg).toBe(false);
    expect(body.prompt_config.refine_multiturn).toBe(true);
    expect(body.prompt_config.cross_languages).toEqual([]);
    expect(body.rerank_id ?? '').toBe(''); // 通用助手不强制传 rerank_id
  });
});
```

> 如果 spec 当前的 mock 工厂命名不同（例如 `prismaMock.assistant.create` 而非 `prisma.client.assistant.create`），按已有写法对齐——**不要为这两个 case 重写 fixture**。

- [ ] **Step 2: 跑测试确认 RED**

```bash
pnpm -F @sinopec-kb/server vitest run \
  src/modules/assistant/assistant.service.spec.ts
```

预期：2 个新 case 失败（`create()` / `createGeneral()` 还没把新字段塞进 body）。

- [ ] **Step 3: 暂不 commit**（合并到 Task 9）。

---

### Task 9: 【GREEN】 实现 `create()` / `createGeneral()` 透传

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.ts`

- [ ] **Step 1: 在 `create()` 头部解析新字段默认值**

紧跟 `const opener = ...` 之后追加：

```typescript
const showQuote = dto.showQuote ?? true;
const useKnowledgeGraph = dto.useKnowledgeGraph ?? false;
const refineMultiturn = dto.refineMultiturn ?? true;
const crossLanguages = dto.crossLanguages ?? [];
const keyword = dto.keyword ?? false;
```

- [ ] **Step 2: 改 `ragflow.request('POST', '/api/v1/chats', ...)` body**

替换 181-208 行为：

```typescript
const ragflowData = await this.ragflow.request<{ id: string }>(
  'POST',
  '/api/v1/chats',
  {
    name: dto.name,
    icon: dto.avatar,
    description: dto.description,
    dataset_ids: dto.datasetIds,
    llm_id: modelName,
    llm_setting: {
      temperature: dto.temperature,
      top_p: dto.topP,
      presence_penalty: dto.presencePenalty,
      frequency_penalty: dto.frequencyPenalty,
      max_tokens: dto.maxTokens,
    },
    prompt_config: AssistantService.toPromptConfig({
      prompt,
      opener,
      emptyResponse,
      hasKnowledgeBase,
      keyword,
      showQuote,
      useKnowledgeGraph,
      refineMultiturn,
      crossLanguages,
    }),
    similarity_threshold: dto.similarityThreshold,
    // 数值无变换：DTO `keywordsSimilarityWeight` 直接对应 RAGFlow
    // `vector_similarity_weight`（命名歧义见 plan follow-up；语义即"向量权重"，
    // 与 i18n label 一致——值越大越偏向量相似度）
    vector_similarity_weight: dto.keywordsSimilarityWeight,
    top_n: dto.topN,
    top_k: dto.topK,
    rerank_id: dto.rerankId ?? '',
  },
);
```

> `keyword` 已经搬进 `toPromptConfig`，body 顶层不要再传——RAGFlow 0.24 PromptConfig 接口 `chat.ts:11` 实证。

- [ ] **Step 3: 改 `prisma.client.assistant.create({ data: ... })`**

把 212-232 行 data 改为：

```typescript
        data: {
          name: dto.name,
          avatar: dto.avatar,
          description: dto.description,
          assistantId: ragflowData.id,
          modelName,
          temperature: dto.temperature,
          topP: dto.topP,
          presencePenalty: dto.presencePenalty,
          frequencyPenalty: dto.frequencyPenalty,
          maxTokens: dto.maxTokens,
          similarityThreshold: dto.similarityThreshold,
          keywordsSimilarityWeight: dto.keywordsSimilarityWeight,
          topN: dto.topN,
          topK: dto.topK,
          emptyResponse,
          opener,
          prompt,
          datasetIds: dto.datasetIds ?? [],
          rerankId: dto.rerankId ?? null,
          keyword,
          useKnowledgeGraph,
          refineMultiturn,
          showQuote,
          crossLanguages,
          userId: user.sub,
        },
```

- [ ] **Step 4: 修 `createGeneral()` body**

把 264-279 行 body 改为：

```typescript
const ragflowData = await this.ragflow.request<{ id: string }>(
  'POST',
  '/api/v1/chats',
  {
    name: '通用助手',
    description: '通用 AI 对话助手',
    dataset_ids: [],
    llm_id: this.defaultModelName,
    prompt_config: AssistantService.toPromptConfig({
      prompt: AssistantService.GENERAL_CHAT_PROMPT,
      opener: AssistantService.DEFAULT_OPENER,
      emptyResponse: '',
      hasKnowledgeBase: false,
      keyword: false,
      showQuote: false,
      useKnowledgeGraph: false,
      refineMultiturn: true,
      crossLanguages: [],
    }),
  },
);
```

- [ ] **Step 5: 跑测试 + tsc，全绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

预期：Task 6 / Task 8 spec 全绿；`update()` 仍因 `toPromptConfig` 缺参数 type-error。

- [ ] **Step 6: Commit（合并 Task 7+9 的 service.ts 改动 + 新 spec）**

```bash
git add apps/server/src/modules/assistant/assistant.service.ts \
        apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ sync rerank-aligned fields on assistant create"
```

---

### Task 10: 【RED】 spec — `update()` partial + DB 回滚分支

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.spec.ts`

- [ ] **Step 1: 末尾追加 describe**

```typescript
describe('AssistantService.update (partial 回填 + 回滚)', () => {
  it('partial DTO（仅传 rerankId）→ 其它字段从 DB 旧值回填到 RAGFlow PUT', async () => {
    const existing = {
      id: 1,
      assistantId: 'rag-id-1',
      name: 'old',
      avatar: null,
      description: null,
      modelName: 'm',
      temperature: 0.1,
      topP: 0.3,
      presencePenalty: 0.4,
      frequencyPenalty: 0.7,
      maxTokens: 512,
      similarityThreshold: 0.2,
      keywordsSimilarityWeight: 0.3,
      topN: 6,
      topK: 1024,
      emptyResponse: '无',
      opener: 'hi',
      prompt: 'p',
      datasetIds: ['ds-1'],
      rerankId: null,
      keyword: true,
      useKnowledgeGraph: true,
      refineMultiturn: false,
      showQuote: false,
      crossLanguages: ['zh'],
    };
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue(existing);
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      isAdmin: true,
    });
    prisma.client.assistant.update.mockResolvedValue(existing);

    await service.update({ sub: 1 } as any, 1, {
      rerankId: 'BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible',
    } as any);

    const putCall = ragflow.request.mock.calls.find(
      ([method]) => method === 'PUT',
    );
    const [, , body] = putCall!;
    expect(body.rerank_id).toBe(
      'BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible',
    );
    // 回填验证：用户没传，但 PUT body 里仍是 DB 旧值
    expect(body.prompt_config.keyword).toBe(true);
    expect(body.prompt_config.use_kg).toBe(true);
    expect(body.prompt_config.refine_multiturn).toBe(false);
    expect(body.prompt_config.quote).toBe(false);
    expect(body.prompt_config.cross_languages).toEqual(['zh']);
  });

  it('RAGFlow PUT 失败 → DB 回滚（含新字段）', async () => {
    const existing = {
      id: 1,
      assistantId: 'rag-id-1',
      name: 'old',
      avatar: null,
      description: null,
      modelName: 'm',
      temperature: 0.1,
      topP: 0.3,
      presencePenalty: 0.4,
      frequencyPenalty: 0.7,
      maxTokens: 512,
      similarityThreshold: 0.2,
      keywordsSimilarityWeight: 0.3,
      topN: 6,
      topK: 1024,
      emptyResponse: '无',
      opener: 'hi',
      prompt: 'p',
      datasetIds: ['ds-1'],
      rerankId: null,
      keyword: false,
      useKnowledgeGraph: false,
      refineMultiturn: true,
      showQuote: true,
      crossLanguages: [],
    };
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue(existing);
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      isAdmin: true,
    });
    prisma.client.assistant.update.mockResolvedValueOnce({} as any);
    ragflow.request.mockRejectedValueOnce(new Error('ragflow down'));
    prisma.client.assistant.update.mockResolvedValueOnce(existing);

    await expect(
      service.update({ sub: 1 } as any, 1, {
        rerankId: 'new-rerank',
        keyword: true,
      } as any),
    ).rejects.toThrow('ragflow down');

    // 第二次 update 是回滚——参数应包含全部旧字段（含 6 个新字段）
    const rollbackCall = prisma.client.assistant.update.mock.calls[1];
    expect(rollbackCall[0].data).toMatchObject({
      rerankId: null,
      keyword: false,
      useKnowledgeGraph: false,
      refineMultiturn: true,
      showQuote: true,
      crossLanguages: [],
    });
  });
});
```

- [ ] **Step 2: RED 验证**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
```

预期：2 个新 case 失败（update 还没读 DTO 新字段、回滚也未含新字段）。

- [ ] **Step 3: 不 commit，并入 Task 11。**

---

### Task 11: 【GREEN】 `update()` 同步新字段 + 回滚补齐

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.ts:401-487`

- [ ] **Step 1: 改 `prisma.client.assistant.update` 的 data**

在原 422-425 行 `data: { ..., datasetIds: dto.datasetIds }` 末尾追加：

```typescript
          rerankId: dto.rerankId,
          keyword: dto.keyword,
          useKnowledgeGraph: dto.useKnowledgeGraph,
          refineMultiturn: dto.refineMultiturn,
          showQuote: dto.showQuote,
          crossLanguages: dto.crossLanguages,
```

- [ ] **Step 2: 改 `ragflow.request('PUT', ...)` body**

把 433-456 行替换为：

```typescript
          {
            name: dto.name,
            icon: dto.avatar,
            description: dto.description,
            dataset_ids: dto.datasetIds,
            llm_id: dto.modelName,
            llm_setting: {
              temperature: dto.temperature,
              top_p: dto.topP,
              presence_penalty: dto.presencePenalty,
              frequency_penalty: dto.frequencyPenalty,
              max_tokens: dto.maxTokens,
            },
            prompt_config: AssistantService.toPromptConfig({
              prompt: dto.prompt ?? '',
              opener: dto.opener ?? '',
              emptyResponse: dto.emptyResponse ?? '',
              hasKnowledgeBase: !!(dto.datasetIds && dto.datasetIds.length > 0),
              keyword: dto.keyword ?? assistant.keyword,
              showQuote: dto.showQuote ?? assistant.showQuote,
              useKnowledgeGraph:
                dto.useKnowledgeGraph ?? assistant.useKnowledgeGraph,
              refineMultiturn:
                dto.refineMultiturn ?? assistant.refineMultiturn,
              crossLanguages: dto.crossLanguages ?? assistant.crossLanguages,
            }),
            similarity_threshold: dto.similarityThreshold,
            vector_similarity_weight: dto.keywordsSimilarityWeight,
            top_n: dto.topN,
            top_k: dto.topK,
            rerank_id: dto.rerankId ?? assistant.rerankId ?? '',
          },
```

- [ ] **Step 3: 改回滚分支 DB 还原 data**

466-480 行 data 末尾追加：

```typescript
            rerankId: assistant.rerankId,
            keyword: assistant.keyword,
            useKnowledgeGraph: assistant.useKnowledgeGraph,
            refineMultiturn: assistant.refineMultiturn,
            showQuote: assistant.showQuote,
            crossLanguages: assistant.crossLanguages,
```

- [ ] **Step 4: 回滚分支二次失败处理升级**

把当前 `this.logger.error(...回滚失败)` 那一行（rollback 内部 try-catch）改成：

```typescript
this.logger.error(
  `[ALERT] DB 回滚也失败，本地与 RAGFlow 状态分歧 (id: ${id})。` +
    `需人工核对：assistant.id=${id}, ragflowAssistantId=${assistant.assistantId}`,
  rollbackError,
);
```

> NestJS Logger 没有 `fatal` level。用 `[ALERT]` 前缀让 Loki/ELK 告警规则可识别；架构级改造（outbox/saga 把 RAGFlow 写入异步化）见 plan follow-up。

> **Note**：上述具体行号是当前回滚分支代码的位置（Task 6 之前的 `service.update` rollback try-catch 内部）；如果 review 期间 service.ts 被其它 commit 改动，按相同语义找回滚分支即可。

- [ ] **Step 5: 跑测试 + tsc，全绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
pnpm -F @sinopec-kb/server exec tsc --noEmit
```

预期：所有 case 全绿，0 type error。

- [ ] **Step 6: Commit（含 Task 10 spec + Task 11 service）**

```bash
git add apps/server/src/modules/assistant/assistant.service.ts \
        apps/server/src/modules/assistant/assistant.service.spec.ts
git commit -m "feat(@sinopec-kb/server): ✨ sync rerank-aligned fields on assistant update with rollback"
```

---

### Task 12: 【RED+GREEN 一组】 spec — `keywordsSimilarityWeight` 数值无变换透传

> 这条 task 应对 review #1。reviewer 担心字段名/语义反向。verify 是数值流转无 transform：spec 直接绿（断言现行实现），并加 service 注释固化语义。一旦未来有人加 `1 - x` 转换，spec 立刻 RED。

**Files:**

- Modify: `apps/server/src/modules/assistant/assistant.service.spec.ts`
- Modify: `apps/server/src/modules/assistant/assistant.service.ts`（仅注释）

- [ ] **Step 1: spec 末尾加 case**

```typescript
describe('AssistantService weight semantic invariant', () => {
  it('create: keywordsSimilarityWeight 直接透传成 RAGFlow vector_similarity_weight（无 1-x 反转）', async () => {
    prisma.client.assistant.create.mockResolvedValue({} as any);
    await service.create(
      { sub: 1 } as any,
      { name: 't', keywordsSimilarityWeight: 0.3 } as any,
    );
    const postCall = ragflow.request.mock.calls.find(
      ([method, url]) => method === 'POST' && url === '/api/v1/chats',
    );
    expect(postCall![2].vector_similarity_weight).toBe(0.3);
  });

  it('update: 同上，无变换', async () => {
    const existing = {
      id: 1,
      assistantId: 'rag-id-1',
      keywordsSimilarityWeight: 0.7,
      datasetIds: [],
      rerankId: null,
      keyword: false,
      useKnowledgeGraph: false,
      refineMultiturn: true,
      showQuote: true,
      crossLanguages: [],
      // ...其它字段沿用 fixture
    };
    prisma.client.assistant.findUniqueOrThrow.mockResolvedValue(existing);
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      isAdmin: true,
    });
    prisma.client.assistant.update.mockResolvedValue(existing);
    await service.update({ sub: 1 } as any, 1, {
      keywordsSimilarityWeight: 0.5,
    } as any);
    const putCall = ragflow.request.mock.calls.find(([m]) => m === 'PUT');
    expect(putCall![2].vector_similarity_weight).toBe(0.5);
  });
});
```

- [ ] **Step 2: 跑 spec — 应该直接绿**

```bash
pnpm -F @sinopec-kb/server vitest run src/modules/assistant/
```

预期：2 个新 case 绿（已经透传无变换；本 spec 把这个隐式约定钉为契约）。

如果 RED → 立即停下排查；说明数值有意外变换，超出 plan scope。

- [ ] **Step 3: 在 service.ts 已经写过的 weight 注释处确认存在**

Task 9 Step 2 已加注释：

```typescript
// 数值无变换：DTO `keywordsSimilarityWeight` 直接对应 RAGFlow
// `vector_similarity_weight`（命名歧义见 plan follow-up；语义即"向量权重"，
// 与 i18n label 一致——值越大越偏向量相似度）
```

`update()` 等价位置补一份相同注释（Task 11 重写时也应该有；如果漏了，这里补上）。

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/assistant/assistant.service.spec.ts \
        apps/server/src/modules/assistant/assistant.service.ts
git commit -m "test(@sinopec-kb/server): ✅ pin keywordsSimilarityWeight transparent forwarding"
```

---

### Task 13: 跑覆盖率 + 创建 PR1

**Files:** 无代码修改。

- [ ] **Step 1: 跑覆盖率**

```bash
pnpm -F @sinopec-kb/server test:cov
```

预期：assistant 模块语句/分支/函数覆盖率 ≥ 80%。如果低于阈值，看 V8 coverage 报告补 case（但不改实现）；新加的 spec case 应能把模块覆盖率拉过线。

如果项目当前没配 `test:cov` script 或没 coverage 阈值，确认下：

```bash
grep -n '"test:cov"' apps/server/package.json
grep -rn 'coverage:' apps/server/vitest.config.* 2>/dev/null
```

如果缺失，本 plan 不引入新的 coverage 配置（避免 scope 蔓延），但**至少跑一次 `vitest run --coverage` 把数据贴 PR 描述**作为基线。

- [ ] **Step 2: 推分支**

```bash
git checkout -b feat/assistant-server-align-ragflow
git push -u origin feat/assistant-server-align-ragflow
```

- [ ] **Step 3: gh pr create（PR1 — Server）**

```bash
gh pr create --title "feat(@sinopec-kb/server): ✨ align assistant fields with ragflow" \
  --body "$(cat <<'EOF'
## Summary

把 RAGFlow 0.24 chat assistant 的 6 个核心字段（rerankId / keyword / useKnowledgeGraph / refineMultiturn / showQuote / crossLanguages）落到本项目 Assistant 模块。映射经 RAGFlow 源码 \`web/src/interfaces/database/chat.ts:4-17\` 与 \`web/src/components/rerank.tsx\` 实证：rerank_id 在顶层，其余 5 个在 prompt_config 嵌套。

## Changes

- `prisma/models/assistant.prisma` — 6 字段
- `prisma/migrations/<TS>_assistant_align_with_ragflow` — 仅 ADD COLUMN
- `assistant.dto.ts` — DTO 6 字段（class-validator）
- `assistant.entity.ts` — Entity 6 字段
- `prompt-config.types.ts` — 显式 `PromptConfig` / `ToPromptConfigInput` interface
- `assistant.service.ts` — `create / createGeneral / update` 透传 + partial 回填 + 回滚分支补齐
- `assistant.service.spec.ts` — RED-first 6 个 describe 块覆盖

## Follow-up（已记 issue）

- TTS / PageIndex / Tavily / meta_data_filter / parameters / Freedom preset
- `keywordsSimilarityWeight` rename + migration
- `useLlmOptions` catch console.error
- `update()` 二次失败 outbox/saga
- E2E Playwright

## Test plan

- [x] \`pnpm -F @sinopec-kb/server vitest run\`
- [x] \`pnpm -F @sinopec-kb/server exec tsc --noEmit\`
- [x] \`pnpm -F @sinopec-kb/server test:cov\` ≥ 80%
- [x] migration SQL 仅 ADD COLUMN
EOF
)"
```

- [ ] **Step 4: 等 CI 绿（按 development-workflow §6，自己 poll，不让用户去看）**

```bash
gh pr checks --watch
```

CI 红：拉 log 自己定位。绿了进 PR2。

---

# ━━━ PR 2: Client ━━━

> base = PR1 merge commit。开始前 `git fetch origin && git checkout origin/main && git checkout -b feat/assistant-client-align-ragflow`。

### Task 14: 扩展 `useLlmOptions` 加 'rerank' 类型

**Files:**

- Modify: `apps/client/src/composables/useLlmOptions.ts`

> 遵循 library-preference.md：现有 composable 已支持按 `model_type` 过滤，仅 type union 缺 'rerank'。不新建 composable。

- [ ] **Step 1: 改函数签名**

```typescript
export function useLlmOptions(modelType?: 'chat' | 'embedding' | 'rerank') {
```

注释同步：

```typescript
/**
 * 获取 RAGFlow 已配置的 LLM 模型，按 model_type 分组为下拉选项
 * @param modelType - 过滤模型类型，如 'chat' | 'embedding' | 'rerank'
 */
```

- [ ] **Step 2: 类型检查**

```bash
pnpm -F @sinopec-kb/client exec vue-tsc --noEmit
```

预期：0 error。

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/composables/useLlmOptions.ts
git commit -m "feat(@sinopec-kb/client): ✨ extend useLlmOptions to support rerank model type"
```

---

### Task 15: 重生成 OpenAPI 类型（先 SWC build）

**Files:**

- Modify (auto): `apps/client/src/types/openapi.d.ts`

- [ ] **Step 1: 后端 build（让 SWC 出最新 `metadata.ts`）**

```bash
pnpm -F @sinopec-kb/server build
```

CLAUDE.md：「SWC 编译器需要预生成 metadata (`src/metadata.ts`)」。dev 模式下 metadata 可能滞后，build 一次确保 swagger 出新字段。

- [ ] **Step 2: 启动后端**

新开终端：

```bash
pnpm -F @sinopec-kb/server start:prod
```

或：

```bash
pnpm dev:server
```

等 `Application is running on: http://[::1]:3001` 才继续。

- [ ] **Step 3: 重生成 client 类型**

```bash
pnpm -F @sinopec-kb/client openapi
```

- [ ] **Step 4: 验证新字段进入类型**

```bash
grep -E "rerankId|crossLanguages|useKnowledgeGraph|refineMultiturn|showQuote" \
  apps/client/src/types/openapi.d.ts | head
```

预期：每个字段都出现（若漏，回到 Step 1 / SWC 路径排查）。

- [ ] **Step 5: 客户端类型检查**

```bash
pnpm -F @sinopec-kb/client exec vue-tsc --noEmit
```

预期：0 error。

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/types/openapi.d.ts
git commit -m "chore(@sinopec-kb/client): 🔨 regen openapi types for assistant fields"
```

---

### Task 16: i18n（zh-CN + en-US）

**Files:**

- Modify: `apps/client/src/locales/langs/zh-CN/page/assistant.json`
- Modify: `apps/client/src/locales/langs/en-US/page/assistant.json`

- [ ] **Step 1: zh-CN 在 `temperature_desc` 之后追加**

```json
  "rerank_model": "Rerank 模型",
  "rerank_model_desc": "对召回的候选块再次打分，可显著提升首条命中率。留空表示不启用 rerank。",
  "keyword_search": "关键词分析",
  "keyword_search_desc": "在向量检索之外同时启用关键词检索，召回结果按混合权重合并。",
  "use_knowledge_graph": "使用知识图谱",
  "use_knowledge_graph_desc": "回答时引入知识图谱关系（需要知识库已生成 GraphRAG）。",
  "refine_multiturn": "多轮对话优化",
  "refine_multiturn_desc": "把上下文整合进当前问题再去检索，对追问场景更准。",
  "show_quote_field": "显示引文",
  "show_quote_field_desc": "回答中是否展示引用块（仅在关联了知识库时生效）。",
  "cross_languages": "跨语言搜索",
  "cross_languages_desc": "将查询翻译到所选语言再做检索。",
  "top_k": "Top-K",
  "top_k_desc": "召回阶段保留的候选数；rerank/混合排序前的 K 值。",
  "presence_penalty": "存在惩罚",
  "presence_penalty_desc": "鼓励模型谈论新主题，越大越倾向于引入新概念。",
  "frequency_penalty": "频率惩罚",
  "frequency_penalty_desc": "降低模型重复同一句的概率。",
  "max_tokens": "最大 token 数",
  "max_tokens_desc": "单次回答最大生成长度。",
  "avatar": "助理头像"
```

- [ ] **Step 2: en-US 同位置补**

```json
  "rerank_model": "Rerank model",
  "rerank_model_desc": "Rescore retrieval candidates to lift hit@1. Leave empty to disable rerank.",
  "keyword_search": "Keyword search",
  "keyword_search_desc": "Run keyword search alongside vector retrieval; results merged by weighted score.",
  "use_knowledge_graph": "Use knowledge graph",
  "use_knowledge_graph_desc": "Augment answers with knowledge-graph relations (requires GraphRAG built).",
  "refine_multiturn": "Refine multi-turn",
  "refine_multiturn_desc": "Rewrite the question with conversation context before retrieval.",
  "show_quote_field": "Show citations",
  "show_quote_field_desc": "Whether to display reference chunks in answers (only when a KB is attached).",
  "cross_languages": "Cross-language search",
  "cross_languages_desc": "Translate the query into the chosen languages before retrieval.",
  "top_k": "Top-K",
  "top_k_desc": "Number of candidates kept after recall; the K before rerank / hybrid ranking.",
  "presence_penalty": "Presence penalty",
  "presence_penalty_desc": "Encourages the model to introduce new topics.",
  "frequency_penalty": "Frequency penalty",
  "frequency_penalty_desc": "Reduces literal repetition.",
  "max_tokens": "Max tokens",
  "max_tokens_desc": "Maximum tokens generated per answer.",
  "avatar": "Avatar"
```

- [ ] **Step 3: cspell 校验**

```bash
pnpm cspell "apps/client/src/locales/langs/**/assistant.json"
```

如有未知词加进 `cspell.json`，不要改翻译。

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/locales/langs
git commit -m "feat(@sinopec-kb/client): ✨ i18n keys for ragflow-aligned assistant settings"
```

---

### Task 17: 抽 `CROSS_LANGUAGE_OPTIONS` 常量

**Files:**

- Create: `apps/client/src/constants/ragflow.ts`

- [ ] **Step 1: 写常量文件**

```typescript
import type { SelectOption } from 'naive-ui';

/**
 * RAGFlow `prompt_config.cross_languages` 支持的语言代码。
 * 来源：RAGFlow 0.24 web/src/pages/next-chats/chat/app-settings/chat-settings.tsx
 * 默认值 [] 见同文件第 56 行。
 */
export const CROSS_LANGUAGE_OPTIONS: SelectOption[] = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Português', value: 'pt' },
  { label: 'Русский', value: 'ru' },
];
```

- [ ] **Step 2: Commit（独立 commit，与表单解耦）**

```bash
git add apps/client/src/constants/ragflow.ts
git commit -m "feat(@sinopec-kb/client): ✨ extract CROSS_LANGUAGE_OPTIONS constant"
```

---

### Task 18: 抽屉表单补字段（含 pro-digit 数值约束）

**Files:**

- Modify: `apps/client/src/views/assistant/chat/[id].page.vue`

- [ ] **Step 1: import 调整**

```typescript
import { useKnowledgeBaseOptions, useLlmOptions } from '@/composables';
import { CROSS_LANGUAGE_OPTIONS } from '@/constants/ragflow';
```

并在已有 `const { options: kbOptions, ... }` 后追加：

```typescript
const { options: rerankOptions, loading: rerankLoading } =
  useLlmOptions('rerank');
const { options: chatModelOptions, loading: llmLoading } =
  useLlmOptions('chat');
```

- [ ] **Step 2: 抽屉表单字段块（按截图视觉顺序，pro-digit 全部带数值约束）**

替换原 `pro-drawer-content` 内容：

```html
<pro-input :title="$t('page.assistant.name')" path="name" required />
<pro-input :title="$t('page.assistant.avatar')" path="avatar" />
<pro-textarea :title="$t('page.assistant.description')" path="description" />
<pro-textarea
  :title="$t('page.assistant.empty_response')"
  :tooltip="$t('page.assistant.empty_response_desc')"
  path="emptyResponse"
/>
<pro-textarea
  :title="$t('page.assistant.opener')"
  :tooltip="$t('page.assistant.opener_desc')"
  path="opener"
/>
<pro-switch
  :title="$t('page.assistant.show_quote_field')"
  :tooltip="$t('page.assistant.show_quote_field_desc')"
  path="showQuote"
/>
<pro-switch
  :title="$t('page.assistant.keyword_search')"
  :tooltip="$t('page.assistant.keyword_search_desc')"
  path="keyword"
/>
<pro-select
  :title="$t('page.assistant.knowledgeBase')"
  path="datasetIds"
  :field-props="{
            options: kbOptions,
            loading: kbLoading,
            multiple: true,
            filterable: true,
            placeholder: '请选择关联知识库',
          }"
/>
<pro-textarea
  :title="$t('page.assistant.prompt')"
  :tooltip="$t('page.assistant.prompt_desc')"
  path="prompt"
/>
<pro-digit
  :title="$t('page.assistant.similarity_threshold')"
  :tooltip="$t('page.assistant.similarity_threshold_desc')"
  path="similarityThreshold"
  :field-props="{ min: 0, max: 1, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.vector_similarity_weight')"
  :tooltip="$t('page.assistant.vector_similarity_weight_desc')"
  path="keywordsSimilarityWeight"
  :field-props="{ min: 0, max: 1, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.top_n')"
  :tooltip="$t('page.assistant.top_n_desc')"
  path="topN"
  :field-props="{ min: 1, max: 30, step: 1, precision: 0 }"
/>
<pro-switch
  :title="$t('page.assistant.refine_multiturn')"
  :tooltip="$t('page.assistant.refine_multiturn_desc')"
  path="refineMultiturn"
/>
<pro-switch
  :title="$t('page.assistant.use_knowledge_graph')"
  :tooltip="$t('page.assistant.use_knowledge_graph_desc')"
  path="useKnowledgeGraph"
/>
<pro-select
  :title="$t('page.assistant.rerank_model')"
  :tooltip="$t('page.assistant.rerank_model_desc')"
  path="rerankId"
  :field-props="{
            options: rerankOptions,
            loading: rerankLoading,
            clearable: true,
            filterable: true,
            placeholder: '不启用 rerank',
          }"
/>
<pro-digit
  :title="$t('page.assistant.top_k')"
  :tooltip="$t('page.assistant.top_k_desc')"
  path="topK"
  :field-props="{ min: 1, max: 2048, step: 1, precision: 0 }"
/>
<pro-select
  :title="$t('page.assistant.cross_languages')"
  :tooltip="$t('page.assistant.cross_languages_desc')"
  path="crossLanguages"
  :field-props="{
            multiple: true,
            clearable: true,
            options: CROSS_LANGUAGE_OPTIONS,
            placeholder: '请选择目标语言',
          }"
/>
<pro-select
  :title="$t('page.assistant.model')"
  path="modelName"
  :field-props="{
            options: chatModelOptions,
            loading: llmLoading,
            filterable: true,
          }"
/>
<pro-digit
  :title="$t('page.assistant.temperature')"
  :tooltip="$t('page.assistant.temperature_desc')"
  path="temperature"
  :field-props="{ min: 0, max: 2, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.top_p')"
  :tooltip="$t('page.assistant.top_p_desc')"
  path="topP"
  :field-props="{ min: 0, max: 1, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.presence_penalty')"
  :tooltip="$t('page.assistant.presence_penalty_desc')"
  path="presencePenalty"
  :field-props="{ min: -2, max: 2, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.frequency_penalty')"
  :tooltip="$t('page.assistant.frequency_penalty_desc')"
  path="frequencyPenalty"
  :field-props="{ min: -2, max: 2, step: 0.05, precision: 2 }"
/>
<pro-digit
  :title="$t('page.assistant.max_tokens')"
  :tooltip="$t('page.assistant.max_tokens_desc')"
  path="maxTokens"
  :field-props="{ min: 1, max: 16384, step: 1, precision: 0 }"
/>
```

- [ ] **Step 3: 类型检查 + lint**

```bash
pnpm -F @sinopec-kb/client exec vue-tsc --noEmit
pnpm -F @sinopec-kb/client lint
```

- [ ] **Step 4: Commit**

```bash
git add 'apps/client/src/views/assistant/chat/[id].page.vue'
git commit -m "feat(@sinopec-kb/client): ✨ align assistant chat-settings drawer with ragflow"
```

---

### Task 19: 端到端验证 + 创建 PR2

**Files:** 无代码修改。

- [ ] **Step 1: 启动**

```bash
pnpm docker:dev
pnpm dev
```

- [ ] **Step 2: 在 `/assistant/chat/<id>` 打开抽屉，**

预期：

- 截图里 P0/P1 全部字段可见
- Rerank dropdown 加载至少一项（`BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible`）
- 选中后保存弹"更新成功"

- [ ] **Step 3: SSH 到 ragflow 校验**

```bash
ssh ragflow "docker exec docker-mysql-1 mysql -uroot -pinfini_rag_flow rag_flow -e \
  \"SELECT id, name, rerank_id, prompt_config FROM dialog \
   WHERE id='c52e3c2a487e11f1a9b8932ed31a3307'\\G\""
```

预期：

- `rerank_id` 列从空变为 `BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible`
- `prompt_config` JSON 内出现新键 `keyword` / `use_kg` / `refine_multiturn` / `cross_languages`，且类型/值与 UI 一致（特别是 `cross_languages` 是 JSON Array 而非 string）

- [ ] **Step 4: 在抽屉里再发一条问题验证回答正常**

发 `测试 2 知识库 1 工区试验段控制点编号都有哪些`，应得到带引用的回答。截图贴 PR 描述。

- [ ] **Step 5: 推 PR2**

```bash
git push -u origin feat/assistant-client-align-ragflow
gh pr create --title "feat(@sinopec-kb/client): ✨ align assistant chat-settings UI with ragflow" \
  --body "$(cat <<'EOF'
## Summary

抽屉表单对齐 RAGFlow 0.24 chat assistant 设置页全部字段（截图字段除 follow-up 列出的 6 项外），让用户在本项目 UI 完成 rerank 配置。

## Changes

- \`composables/useLlmOptions.ts\` — type union 加 \`'rerank'\`（不新建 composable）
- \`constants/ragflow.ts\` — \`CROSS_LANGUAGE_OPTIONS\` 常量
- \`views/assistant/chat/[id].page.vue\` — 抽屉表单补 14 个新控件，pro-digit 全部带 step/min/max
- \`types/openapi.d.ts\` — pnpm openapi 重生成（依赖 PR1 字段）
- i18n zh-CN / en-US — 14 条新 key

## Test plan

- [x] \`pnpm -F @sinopec-kb/client exec vue-tsc --noEmit\`
- [x] \`pnpm -F @sinopec-kb/client lint\`
- [x] dev 抽屉手动验证 rerank → 保存 → DB \`rerank_id\` 写入
- [x] dev 验证 \`prompt_config\` JSON 含 5 个新嵌套字段
EOF
)"
gh pr checks --watch
```

---

# ━━━ PR 3: Eval ━━━

### Task 20: 写 rerank 对照 config

**Files:**

- Create: `apps/server/scripts/eval/configs/prod-test2-rerank.json`

- [ ] **Step 1: 创建文件**

```json
{
  "experimentId": "prod-test2-rerank",
  "_desc": "测试 2 dataset + bge-reranker-v2-m3。对照 prod-test2 (dev 78.3% / holdout 79.3%) 看 rerank 是否提升。",
  "datasetIds": ["a691b35e487a11f1a9b8932ed31a3307"],
  "assistantId": "c52e3c2a487e11f1a9b8932ed31a3307",
  "split": "dev",
  "retrieval": {
    "topK": 1024,
    "similarityThreshold": 0.2,
    "vectorSimilarityWeight": 0.3,
    "keyword": false,
    "topN": 6,
    "rerankId": "BAAI/bge-reranker-v2-m3___OpenAI-API@OpenAI-API-Compatible"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git checkout -b feat/eval-test2-rerank
git add apps/server/scripts/eval/configs/prod-test2-rerank.json
git commit -m "test(@sinopec-kb/server): ✅ eval config for prod-test2 with bge-reranker-v2-m3"
```

---

### Task 21: 跑 eval + 对比 baseline

**Files:** results 目录（视仓库习惯决定是否提交）

- [ ] **Step 1: 跑 dev split**

```bash
cd /root/code/sinopec-knowledge-base/apps/server
pnpm exec dotenvx run --env-file=.env -- \
  tsx scripts/eval/run.ts \
    --config scripts/eval/configs/prod-test2-rerank.json \
    --split dev
```

- [ ] **Step 2: 对比基线**

```bash
echo '--- baseline ---'
grep -E '(MRR|hit@|doc-match|answer-final)' \
  apps/server/scripts/eval/results/prod-test2/summary.md
echo '--- rerank ---'
grep -E '(MRR|hit@|doc-match|answer-final)' \
  apps/server/scripts/eval/results/prod-test2-rerank/summary.md
```

- [ ] **Step 3: 写结论到 PR 描述**

判断：

- 上升 → 在 PR 里建议把 `prod-test2.json` 替换为 rerank 版（**作为单独 follow-up issue，本 PR 不动 prod 基线**）
- 持平/下降 → 列入 follow-up：跑 weight=0.5/0.7 三档对比

---

### Task 22: 创建 PR3 + 等 CI

```bash
git push -u origin feat/eval-test2-rerank
gh pr create --title "test(@sinopec-kb/server): ✅ rerank A/B for prod-test2" \
  --body "$(cat <<'EOF'
## Summary

跑 BAAI/bge-reranker-v2-m3 rerank 对照 prod-test2 baseline (dev 78.3% / holdout 79.3%)，看是否提升答案命中率。

## Result

[补结论：MRR / hit@1 / hit@3 / answer-final-avg]

## Test plan

- [x] dev split 跑完，对比 baseline
- [ ] 若结果好转：建 follow-up issue 把 prod-test2.json 替换为 rerank 版
- [ ] 若结果持平/下降：建 follow-up issue 跑 weight=0.5/0.7 sweep
EOF
)"
gh pr checks --watch
```

---

### Task 23: 列 follow-up issues

按 code-review.md follow-up 规则，PR 作者建 issue（AI 不擅建）。本 plan 列出待建：

- [ ] **TTS 文本转语音** —— `prompt_config.tts`
- [ ] **PageIndex 调研** —— 截图存在但 RAGFlow 0.24 无对应字段，先确认是定制还是旧版
- [ ] **Tavily API Key** —— `prompt_config.tavily_api_key`
- [ ] **meta_data_filter** —— 顶层 JSON，需 query builder UI
- [ ] **`parameters` 变量自定义** —— 当前硬编码 `[{key: 'knowledge'}]`
- [ ] **Freedom 自由度 preset** —— 4 个 LLM 参数预设
- [ ] **`reasoning` / `toc_enhance`** —— RAGFlow 0.24 schema 有，截图无
- [ ] **`keywordsSimilarityWeight` rename + migration** —— 字段名歧义
- [ ] **`useLlmOptions` catch 加 console.error** —— silent failure
- [ ] **`update()` 二次失败 outbox/saga** —— 当前仅 logger.error 标 [ALERT]
- [ ] **抽屉表单 Playwright E2E** —— 覆盖 rerank 选择 → 保存 → 校验
- [ ] **`useLlmOptions` 单测** —— 当前 composable 无测试
- [ ] **Rerank 启用条件渲染 top_k 滑块** —— 对齐 RAGFlow UX

每个 issue 写 context（链回 PR）、验收标准、优先级；本 plan 只产出待办列表，不直接 `gh issue create`。

---

## Field Mapping Reference

| UI / DTO（camelCase） | Prisma 列 | RAGFlow API 路径 | 默认值 | RAGFlow 源码出处 |
| --- | --- | --- | --- | --- |
| `rerankId` | `rerankId String?` | 顶层 `rerank_id`（空字符串 = 不启用） | `null` | `web/src/components/rerank.tsx:24,53` |
| `keyword` | `keyword Boolean` | **`prompt_config.keyword`**（嵌套，非顶层！） | `false` | `web/src/interfaces/database/chat.ts:11` |
| `useKnowledgeGraph` | `useKnowledgeGraph Boolean` | `prompt_config.use_kg` | `false` | `web/src/interfaces/database/chat.ts:13` |
| `refineMultiturn` | `refineMultiturn Boolean` | `prompt_config.refine_multiturn` | `true` | `web/src/interfaces/database/chat.ts:12` |
| `showQuote` | `showQuote Boolean` | `prompt_config.quote`（再 `&&` `hasKnowledgeBase`） | `true` | `web/src/interfaces/database/chat.ts:10` |
| `crossLanguages` | `crossLanguages String[]` | `prompt_config.cross_languages` | `[]` | `web/src/interfaces/database/chat.ts:15` |

---

## Risk Notes

1. **RAGFlow PUT 全量替换**：partial DTO 缺字段必须用 DB 旧值兜底，否则改名会清空 prompt（同 `scripts/eval/run.ts:243`）。Task 11 已实现 + Task 10 spec 钉死。
2. **`rerank_id` NOT NULL**：dialog 表 `rerank_id varchar(128) NO`，必须传空字符串而不是 null。Task 9/11 都用 `?? ''`。
3. **`keyword` 字段位置易错**：截图看似顶层独立 switch，RAGFlow 实际在 `prompt_config` 嵌套。Task 6 spec 钉位置（`body.keyword === undefined`、`body.prompt_config.keyword === true`）。
4. **`showQuote` 与 `hasKnowledgeBase` 耦合**：原行为「无 KB 自动 quote=false」保留，新字段做 AND（Task 7）。
5. **`crossLanguages` JSON 形态**：Task 19 Step 3 抽 RAGFlow DB 验证写入是 JSON Array 而非 string。
6. **`keywordsSimilarityWeight` 命名歧义**：字段名误叫 keyword，i18n label 与最终 RAGFlow 字段都是 vector，数值无变换——行为正确但命名 confusing。Task 12 spec 钉透传不变换；rename 列 follow-up（破坏性 refactor，独立 PR）。
7. **PR 顺序**：PR2 必须在 PR1 merge 后开工（OpenAPI 类型依赖）；PR3 在 PR1 merge 后即可（assistant config 已能写入新字段）。
8. **Migration 不可变**：Task 2 产出的 SQL apply 后只读，review 调整必须新建 fix migration（prisma-rules.md）。
