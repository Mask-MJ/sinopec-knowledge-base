# 测试知识库 3（bge-large-zh-v1.5）+ 聊天助手 3 全流程 E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写一个 Playwright 端到端 spec，从零创建一个用 `BAAI/bge-large-zh-v1.5` 做 embedding 的"测试知识库 3"，把 prod KB（用 `bge-m3`）的 6 份源 docx 整套上传 + 解析向量化，再创建关联到该 KB 的"聊天助手 3"，然后通过业务 API 跑 `questions.json` 全 20 题真问真答，最后写出 summary 用于跟之前 prod KB 的答案做对照。

**Architecture:** 复用上一轮已经入库的 `chat-eval-all-questions.spec.ts`（PR #23）的业务 API 调用模式（`APIRequestContext` + dotenvx 加载 `.env`）。但路径从"用现存 prod KB + assistant"扩展到"建 KB → 上传 → parse → 建 assistant → chat"完整链路。整份脚本是单一 spec 文件，无 UI 交互，全靠 sinopec-kb 业务 API（透传给 RAGFlow）。串行处理避免 RAGFlow 内存压力。

**Tech Stack:** Playwright (`@playwright/test` + `APIRequestContext`)、`@dotenvx/dotenvx`（已装）、Node `fs`/`path`、Chinese 文件名 `multipart/form-data` 上传。

---

## File Structure

| 文件 | 责任 | 状态 |
|---|---|---|
| `apps/client/e2e/kb-bge-large-fullstack.spec.ts` | 单文件主 spec：登录 → 找 embedding id → 创建 KB → 上传 docx → parse → 创建 assistant → 创建 session → 跑 20 题 → 写 summary | **新增** |
| `apps/client/e2e/fixtures/*.docx` | 6 份源 docx（fixtures/.gitignore 已排除入库；本地缓存）| 已有 3 份；任务 1 补齐到 6 份 |
| `apps/client/playwright.prod.config.ts` | dotenvx 加载 + system Chrome | 已有，无需改 |
| `apps/client/test-results/kb-bge-large-fullstack.json` | spec 产出 summary（被 .gitignore）| 运行期生成 |
| `turbo.json` | `globalEnv` 已含 `E2E_BASE_URL` / `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` | 已有，无需改 |

KB 与 assistant 的命名固定为"测试知识库 3" / "聊天助手 3"——若要复跑，先在 UI 上手工删掉它们或者改 spec 里的常量。spec 跑前会通过名字 list 检查；如果同名已存在，spec 报错让人决策（避免 silently 创建第二个同名）。

---

## 已知值（spec 直接写死或 env 默认）

| 名称 | 值 | 来源 |
|---|---|---|
| 业务 base URL | `http://39.96.194.119`（prod nginx）| `.env` `E2E_BASE_URL` |
| admin 凭据 | `admin` / `Admin@123` | `.env` |
| 目标 embedding model id | `BAAI/bge-large-zh-v1.5___OpenAI-API@OpenAI-API-Compatible` | RAGFlow 已注册（实测 GET `/api/knowledge-base/llms` 返回 `available=1`）|
| 新 KB 名 | `测试知识库 3` | 用户指定 |
| 新 assistant 名 | `聊天助手 3` | 用户指定 |
| 6 份 fixtures docx | 3 份本地已有 + 3 份要从 RAGFlow MinIO bucket `6ec4cd18476611f1a9b8932ed31a3307` 拉 | 任务 1 |
| chunk_method | `naive` | 业务 service 默认 |
| parser_config | `DEFAULT_KB_PARSER_CONFIG`（DeepDOC + 512 + `\n` + raptor/graphrag OFF）| PR #24 业务层 service 浅合并 |

---

## Task 1: 把缺失的 3 份 fixtures docx 从 minio 拉到本地

**Files:**
- 修改：`apps/client/e2e/fixtures/`（仅追加，不入库）

- [ ] **Step 1: 列 fixtures 现有 docx**

```bash
ls -la /root/code/sinopec-knowledge-base/apps/client/e2e/fixtures/*.docx
```

预期：3 份 — 2014页岩气、2024顺北21工程设计、2024顺北21试验报告。

- [ ] **Step 2: 从 prod KB minio bucket 拉缺失的 3 份 docx 到 ragflow:/tmp**

```bash
ssh ragflow 'docker exec docker-minio-1 sh -c "
mc alias set local http://localhost:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD >/dev/null 2>&1
mkdir -p /tmp/fix-extra
for f in \"2020年中21井区三维地震勘探资料采集项目总结报告_noimg-没提问题做干扰用.docx\" \"2022年塔里木盆地顺托果勒区块顺北43井东三维地震勘探资料采集项目测量施工总结报告_noimg.docx\" \"2024年塔里木盆地顺托果勒西区块顺北21井区三维地震勘探项目测量施工总结报告_noimg.docx\"; do
  mc cp \"local/6ec4cd18476611f1a9b8932ed31a3307/\$f\" \"/tmp/fix-extra/\$f\" 2>&1 | tail -1
done
ls -la /tmp/fix-extra/
"'
```

预期：3 个文件复制成功。

- [ ] **Step 3: 把 ragflow:/tmp/fix-extra 拷出来到本地 fixtures**

```bash
ssh ragflow 'docker cp docker-minio-1:/tmp/fix-extra/. /tmp/fix-extra/ && tar -czf /tmp/fix-extra.tar.gz -C /tmp/fix-extra .'
scp ragflow:/tmp/fix-extra.tar.gz /tmp/fix-extra.tar.gz
tar -xzf /tmp/fix-extra.tar.gz -C /root/code/sinopec-knowledge-base/apps/client/e2e/fixtures/
ls -la /root/code/sinopec-knowledge-base/apps/client/e2e/fixtures/*.docx
```

预期：现在共 6 份 docx，所有文件名以 `.docx` 结尾。

- [ ] **Step 4: 验证 fixtures gitignore 仍把它们排除**

```bash
cd /root/code/sinopec-knowledge-base
git status --ignored apps/client/e2e/fixtures/ | head -10
```

预期：6 份 docx 都在 ignored 列表里（前缀 `!!`），不会被意外入库。

---

## Task 2: 写 spec 骨架（仅 sign-in + embedding 探测，不调写操作）

**Files:**
- 创建：`apps/client/e2e/kb-bge-large-fullstack.spec.ts`

- [ ] **Step 1: 创建 spec 骨架**

写入下面的初版（只走 login + 列 embeddings + 找精确 id），先验证认证 + 接口路径都通。

```typescript
/**
 * E2E (business-API): 从零搭一个用 BAAI/bge-large-zh-v1.5 做 embedding 的
 * "测试知识库 3"，上传 fixtures/ 下的全部 docx，触发 parse，再建关联到该
 * KB 的"聊天助手 3"，跑 questions.json 全 20 题真问真答。整套流程都走
 * sinopec-kb 业务 API，跟用户在 UI 走的路径完全一致。
 *
 * Run:
 *   pnpm exec playwright test --config=playwright.prod.config.ts \
 *     kb-bge-large-fullstack
 */
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set (see apps/client/.env.example)`);
  }
  return value;
}

const BASE_URL = requireEnv('E2E_BASE_URL');
const ADMIN_USER = requireEnv('E2E_ADMIN_USER');
const ADMIN_PASS = requireEnv('E2E_ADMIN_PASS');
const KB_NAME = process.env.E2E_NEW_KB_NAME ?? '测试知识库 3';
const ASSISTANT_NAME =
  process.env.E2E_NEW_ASSISTANT_NAME ?? '聊天助手 3';
const EMBEDDING_HINT =
  process.env.E2E_EMBEDDING_HINT ?? 'bge-large-zh-v1.5';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const QUESTIONS_PATH = resolve(
  __dirname,
  '../../server/scripts/eval/dataset/questions.json',
);
const TEST_RESULTS_DIR = resolve(__dirname, '../test-results');
const SUMMARY_FILE = resolve(TEST_RESULTS_DIR, 'kb-bge-large-fullstack.json');
const PARSE_TIMEOUT_MS = Number(process.env.E2E_PARSE_TIMEOUT_MS ?? 900_000);
const PER_QUESTION_TIMEOUT_MS = Number(
  process.env.E2E_CHAT_QUESTION_TIMEOUT_MS ?? 90_000,
);
const POLL_INTERVAL_MS = 3_000;

interface QuestionRow {
  id: number;
  question: string;
  topic: string;
}
interface QuestionsFile {
  questions: QuestionRow[];
}
interface LlmItem {
  available?: boolean | number;
  fid?: string;
  llm_name?: string;
  model_type?: string;
}
interface DocStatus {
  chunk_count?: number;
  id: string;
  name: string;
  progress: number;
  progress_msg?: string;
  run: string;
}

test.use({ baseURL: BASE_URL });
test.setTimeout(PARSE_TIMEOUT_MS + 25 * PER_QUESTION_TIMEOUT_MS + 120_000);

async function newAuthedApi(
  playwright: PlaywrightWorkerArgs['playwright'],
): Promise<APIRequestContext> {
  const bare = await playwright.request.newContext({ baseURL: BASE_URL });
  const r = await bare.post('/api/auth/authentication/sign-in', {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  const j = (await r.json()) as { accessToken?: string };
  await bare.dispose();
  if (!j.accessToken) throw new Error('sign-in failed: no accessToken');
  return playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${j.accessToken}` },
  });
}

test('skeleton: login + find bge-large-zh-v1.5 embedding id', async ({
  playwright,
}) => {
  const api = await newAuthedApi(playwright);

  const llms = await api.get('/api/knowledge-base/llms');
  expect(llms.ok(), 'GET /api/knowledge-base/llms must succeed').toBe(true);
  const items = (await llms.json()) as LlmItem[];
  const embedding = items.find(
    (m) =>
      m.model_type === 'embedding' &&
      m.available &&
      (m.llm_name ?? '').includes(EMBEDDING_HINT),
  );
  if (!embedding) {
    throw new Error(`no embedding model matching ${EMBEDDING_HINT} found`);
  }
  const embeddingId = `${embedding.llm_name}@${embedding.fid}`;
  console.log(`[discover] embedding id = ${embeddingId}`);
  expect(embeddingId).toContain('bge-large-zh-v1.5');

  await api.dispose();
});
```

- [ ] **Step 2: 跑骨架，验证 login + 找 embedding id 正常**

```bash
cd /root/code/sinopec-knowledge-base/apps/client
pnpm exec playwright test --config=playwright.prod.config.ts \
  kb-bge-large-fullstack --reporter=line
```

预期：

```
[discover] embedding id = BAAI/bge-large-zh-v1.5___OpenAI-API@OpenAI-API-Compatible
1 passed
```

如果失败，根据错误调试 endpoint / token / 模型名。

- [ ] **Step 3: 跑 lint**

```bash
pnpm exec eslint --max-warnings=0 e2e/kb-bge-large-fullstack.spec.ts
```

预期：clean（如果有 prettier 抱怨，跑 `pnpm exec eslint --fix e2e/kb-bge-large-fullstack.spec.ts`）。

---

## Task 3: 加 KB 创建 + 重名守卫

**Files:**
- 修改：`apps/client/e2e/kb-bge-large-fullstack.spec.ts`

- [ ] **Step 1: 把 skeleton 测试名改掉，扩展到创建 KB**

替换 `test('skeleton: ...', ...)` 整个 test 块为下面的扩展版（保留前面 helper 不动）：

```typescript
interface KbItem {
  chunkMethod?: string;
  datasetId?: string;
  embeddingModel?: string;
  id: number;
  name: string;
}
interface CreatedKbResponse {
  datasetId?: string;
  id: number;
  name: string;
}

test('fullstack: create KB → upload → parse → create assistant → chat 20Q', async ({
  playwright,
}) => {
  const api = await newAuthedApi(playwright);

  // ── 1. find embedding id ────────────────────────────────────────────
  const llms = await api.get('/api/knowledge-base/llms');
  expect(llms.ok()).toBe(true);
  const items = (await llms.json()) as LlmItem[];
  const embedding = items.find(
    (m) =>
      m.model_type === 'embedding' &&
      m.available &&
      (m.llm_name ?? '').includes(EMBEDDING_HINT),
  );
  if (!embedding) {
    throw new Error(`no embedding model matching ${EMBEDDING_HINT} found`);
  }
  const embeddingId = `${embedding.llm_name}@${embedding.fid}`;
  console.log(`[discover] embedding id = ${embeddingId}`);

  // ── 2. guard against duplicate KB name ──────────────────────────────
  const existingResp = await api.get(
    `/api/knowledge-base?page=1&pageSize=50&name=${encodeURIComponent(KB_NAME)}`,
  );
  const existingJson = (await existingResp.json()) as { list?: KbItem[] };
  if ((existingJson.list ?? []).some((k) => k.name === KB_NAME)) {
    throw new Error(
      `KB "${KB_NAME}" already exists; delete it first or rename via E2E_NEW_KB_NAME`,
    );
  }

  // ── 3. create the KB ────────────────────────────────────────────────
  const createKb = await api.post('/api/knowledge-base', {
    data: {
      name: KB_NAME,
      permission: 'me',
      chunkMethod: 'naive',
      embeddingModel: embeddingId,
    },
  });
  expect(
    createKb.ok(),
    `KB create failed: ${createKb.status()} ${(await createKb.text()).slice(0, 200)}`,
  ).toBe(true);
  const newKb = (await createKb.json()) as CreatedKbResponse;
  console.log(
    `[create] KB id=${newKb.id} datasetId=${newKb.datasetId} name=${newKb.name}`,
  );
  expect(newKb.id).toBeGreaterThan(0);
  expect(newKb.datasetId, 'datasetId must come back from RAGFlow').toBeDefined();

  await api.dispose();
});
```

- [ ] **Step 2: 跑这个 test，验证创建 KB 成功**

```bash
pnpm exec playwright test --config=playwright.prod.config.ts \
  kb-bge-large-fullstack --reporter=line
```

预期：

```
[discover] embedding id = BAAI/bge-large-zh-v1.5___OpenAI-API@OpenAI-API-Compatible
[create] KB id=<n> datasetId=<32-hex> name=测试知识库 3
1 passed
```

如果失败因为"已存在"，去 UI 把"测试知识库 3"删掉再跑。

- [ ] **Step 3: 提交目前进度（spec 通过 + 创建 KB 验证）**

跳过 commit，等整份 spec 完成再一次提交。

---

## Task 4: 加上传 + 触发 parse + 轮询逻辑

**Files:**
- 修改：`apps/client/e2e/kb-bge-large-fullstack.spec.ts`（在 KB 创建之后追加）

- [ ] **Step 1: 在 test 体内 KB 创建之后追加上传逻辑**

在 `await api.dispose();` 之前插入（暂时保留 dispose，等任务 5/6 之后再挪）：

```typescript
  // ── 4. multipart upload all .docx fixtures to the new KB ────────────
  const fixtures = readdirSync(FIXTURES_DIR).filter((f) => /\.docx?$/i.test(f));
  expect(
    fixtures.length,
    'fixtures must contain at least one .docx',
  ).toBeGreaterThanOrEqual(1);
  console.log(`[upload] ${fixtures.length} docx files`);

  const form = new FormData();
  for (const f of fixtures) {
    const buf = readFileSync(resolve(FIXTURES_DIR, f));
    form.append('files', new Blob([buf]), f);
  }
  const uploadResp = await api.post(
    `/api/knowledge-base/${newKb.id}/documents`,
    { multipart: form },
  );
  expect(
    uploadResp.ok(),
    `upload failed: ${uploadResp.status()} ${(await uploadResp.text()).slice(0, 200)}`,
  ).toBe(true);

  // ── 5. fetch doc ids + trigger parse ────────────────────────────────
  const docsResp = await api.get(
    `/api/knowledge-base/${newKb.id}/documents?page=1&pageSize=50`,
  );
  const docsJson = (await docsResp.json()) as { docs?: DocStatus[] };
  const docIds = (docsJson.docs ?? []).map((d) => d.id);
  expect(
    docIds.length,
    'every fixture should be uploaded',
  ).toBeGreaterThanOrEqual(fixtures.length);

  const parseResp = await api.post(`/api/knowledge-base/${newKb.id}/parse`, {
    data: { documentIds: docIds },
  });
  expect(
    parseResp.ok(),
    `parse trigger failed: ${parseResp.status()}`,
  ).toBe(true);
  console.log(`[parse] triggered for ${docIds.length} docs`);

  // ── 6. poll until every doc reaches a terminal state ────────────────
  const start = Date.now();
  let snapshot: DocStatus[] = [];
  while (Date.now() - start < PARSE_TIMEOUT_MS) {
    const r = await api.get(
      `/api/knowledge-base/${newKb.id}/documents?page=1&pageSize=50`,
    );
    const j = (await r.json()) as { docs?: DocStatus[] };
    snapshot = j.docs ?? [];
    const terminal = snapshot.every((d) =>
      ['CANCEL', 'DONE', 'FAIL'].includes(d.run),
    );
    const summary = snapshot
      .map(
        (d) =>
          `${d.name.slice(0, 22)}…=${d.run}/${Math.round(d.progress * 100)}%`,
      )
      .join('  ');
    console.log(`[poll] ${summary}`);
    if (terminal) break;
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }

  const failed = snapshot.filter((d) => d.run === 'FAIL');
  expect(
    failed.map((d) => `${d.name}: ${d.progress_msg ?? ''}`),
    'no doc should fail to parse',
  ).toEqual([]);
  expect(
    snapshot.filter((d) => d.run === 'DONE').length,
    'every doc should reach DONE',
  ).toBe(snapshot.length);
```

- [ ] **Step 2: 跑 lint + 单跑这段（任务 4 的局部状态会直接 dispose 退出）**

```bash
pnpm exec eslint --max-warnings=0 e2e/kb-bge-large-fullstack.spec.ts
```

不立即跑 spec —— 因为这次会真创建 KB + 上传 + parse；在任务 5/6 完成后再一次跑全量。

---

## Task 5: 加 assistant 创建 + chat 全 20 题

**Files:**
- 修改：`apps/client/e2e/kb-bge-large-fullstack.spec.ts`（continued）

- [ ] **Step 1: 在 parse 完成断言之后追加 assistant + chat 逻辑**

在 `expect(snapshot.filter((d) => d.run === 'DONE').length, ...).toBe(snapshot.length);` 之后插入：

```typescript
  // ── 7. find / create assistant wired to new KB ──────────────────────
  const existingAsstResp = await api.get(
    `/api/assistant?page=1&pageSize=50&name=${encodeURIComponent(ASSISTANT_NAME)}`,
  );
  const existingAsstJson = (await existingAsstResp.json()) as {
    list?: { id: number; name: string }[];
  };
  if ((existingAsstJson.list ?? []).some((a) => a.name === ASSISTANT_NAME)) {
    throw new Error(
      `assistant "${ASSISTANT_NAME}" already exists; delete it first or rename via E2E_NEW_ASSISTANT_NAME`,
    );
  }

  const createAsst = await api.post('/api/assistant', {
    data: {
      name: ASSISTANT_NAME,
      datasetIds: [newKb.datasetId],
    },
  });
  expect(
    createAsst.ok(),
    `assistant create failed: ${createAsst.status()} ${(await createAsst.text()).slice(0, 200)}`,
  ).toBe(true);
  const asst = (await createAsst.json()) as { id: number; name: string };
  console.log(`[create] assistant id=${asst.id} name=${asst.name}`);

  // ── 8. create a fresh session ──────────────────────────────────────
  const sessionResp = await api.post(
    `/api/assistant/${asst.id}/sessions`,
    { data: { name: `bge-large-${Date.now()}` } },
  );
  expect(sessionResp.ok()).toBe(true);
  const session = (await sessionResp.json()) as { id: string };
  console.log(`[session] id=${session.id}`);

  // ── 9. iterate every question via business completions API ────────
  const questionsFile = JSON.parse(
    readFileSync(QUESTIONS_PATH, 'utf8'),
  ) as QuestionsFile;
  const questions = questionsFile.questions;
  console.log(`[plan] ${questions.length} questions to ask`);

  interface ChatResult {
    answer: string;
    durationMs: number;
    qid: number;
    question: string;
    timestamp: string;
    topic: string;
  }
  const results: ChatResult[] = [];
  for (const q of questions) {
    const tag = `Q${String(q.id).padStart(2, '0')}`;
    console.log(`[ask] ${tag} ${q.topic} :: ${q.question.slice(0, 40)}…`);
    const t0 = Date.now();
    const resp = await api.post(`/api/assistant/${asst.id}/completions`, {
      data: {
        question: q.question,
        sessionId: session.id,
        stream: false,
      },
      timeout: PER_QUESTION_TIMEOUT_MS,
    });
    if (!resp.ok()) {
      const body = await resp.text();
      console.warn(`[got]  ${tag} HTTP ${resp.status()} ${body.slice(0, 120)}`);
      results.push({
        qid: q.id,
        topic: q.topic,
        question: q.question,
        answer: `__ERROR__ HTTP ${resp.status()} ${body.slice(0, 200)}`,
        durationMs: Date.now() - t0,
        timestamp: new Date().toISOString(),
      });
      continue;
    }
    const payload = (await resp.json()) as { answer?: string };
    const answer = (payload.answer ?? '').trim();
    results.push({
      qid: q.id,
      topic: q.topic,
      question: q.question,
      answer,
      durationMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
    console.log(
      `[got]  ${tag} ${Date.now() - t0}ms answer=${answer.slice(0, 60)}…`,
    );
  }

  // ── 10. write summary ──────────────────────────────────────────────
  if (!existsSync(TEST_RESULTS_DIR))
    mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  writeFileSync(
    SUMMARY_FILE,
    JSON.stringify(
      {
        kb: { id: newKb.id, datasetId: newKb.datasetId, name: KB_NAME },
        embeddingId,
        assistant: { id: asst.id, name: ASSISTANT_NAME },
        sessionId: session.id,
        questionCount: results.length,
        timestamp: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`[summary] ${SUMMARY_FILE}`);

  await api.dispose();

  // ── 11. assertions ─────────────────────────────────────────────────
  const errors = results.filter((r) => r.answer.startsWith('__ERROR__'));
  expect(
    errors.map((e) => `${e.qid}: ${e.answer}`),
    'no completions request should fail',
  ).toEqual([]);
  for (const r of results) {
    expect(
      r.answer.length,
      `Q${r.qid} answer should be non-empty`,
    ).toBeGreaterThan(0);
  }
});
```

注意：之前任务 3 的 `await api.dispose();` 要删除，因为它会让后续步骤拿不到 api 上下文。任务 5 末尾的 dispose 才是最终的。

- [ ] **Step 2: 删除任务 3 后插入的中间 `await api.dispose();`**

打开 spec 找到任务 3 后面的 `await api.dispose();` 行（在创建 KB 验证之后那次），删除它。

- [ ] **Step 3: lint**

```bash
pnpm exec eslint --max-warnings=0 e2e/kb-bge-large-fullstack.spec.ts
```

预期：clean（出现 prettier issue 时跑 `--fix`）。

- [ ] **Step 4: typecheck**

```bash
pnpm exec tsc --noEmit
```

预期：clean。

---

## Task 6: 跑全流程 + 验证 summary

**Files:**
- 仅运行，不改文件

- [ ] **Step 1: 跑全流程（预期 10-20 分钟）**

```bash
cd /root/code/sinopec-knowledge-base/apps/client
pnpm exec playwright test --config=playwright.prod.config.ts \
  kb-bge-large-fullstack --reporter=line
```

预期：

```
[discover] embedding id = BAAI/bge-large-zh-v1.5___OpenAI-API@OpenAI-API-Compatible
[create] KB id=<n> datasetId=<…> name=测试知识库 3
[upload] 6 docx files
[parse] triggered for 6 docs
[poll] (反复打印进度)
… 最终 6 份 DONE/100%
[create] assistant id=<n> name=聊天助手 3
[session] id=<…>
[plan] 20 questions to ask
[ask] Q01 …
[got]  Q01 …ms answer=…
…(20 题)
[summary] /root/code/sinopec-knowledge-base/apps/client/test-results/kb-bge-large-fullstack.json
1 passed (10–20m)
```

如果中途某步失败：

- KB 创建 / 上传 失败：检查 ssh tunnel + base URL + token
- parse 阶段 timeout：手工 GET 看 progress_msg；可能 RAGFlow embedding 服务出问题
- 任意 chat 题失败：先单题手工 curl 验证 RAGFlow 回得正常

- [ ] **Step 2: 看 summary 摘要确认 20 题答案非空**

```bash
python3 - <<'PY'
import json
d = json.load(open('/root/code/sinopec-knowledge-base/apps/client/test-results/kb-bge-large-fullstack.json'))
print(f"kb={d['kb']['name']} (id={d['kb']['id']})")
print(f"assistant={d['assistant']['name']} (id={d['assistant']['id']})")
print(f"embedding={d['embeddingId']}")
print(f"questions={d['questionCount']}, total wall={sum(r['durationMs'] for r in d['results'])/1000:.1f}s")
print()
focus = {6, 9, 14, 15, 18, 19}
for r in d['results']:
    if r['qid'] in focus:
        print(f"━━━ Q{r['qid']:02d} {r['topic']} ({r['durationMs']}ms) ━━━")
        print(r['answer'][:400])
        print()
PY
```

预期：5 道关心题（Q6/Q9/Q14/Q15/Q18/Q19）都有回答。

---

## Task 7: 与 prod KB（bge-m3）的现有答案对比，给出报告

**Files:**
- 不改文件，只生成对比

- [ ] **Step 1: 加载新旧两份 summary 对比**

```bash
python3 - <<'PY'
import json
new = json.load(open('/root/code/sinopec-knowledge-base/apps/client/test-results/kb-bge-large-fullstack.json'))
old = json.load(open('/root/code/sinopec-knowledge-base/apps/client/test-results/chat-eval-all-questions.json'))

new_by_id = {r['qid']: r for r in new['results']}
old_by_id = {r['qid']: r for r in old['results']}

print(f"new = bge-large-zh-v1.5 / {new['kb']['name']}")
print(f"old = bge-m3            / chat-eval-all-questions (prod KB id=1)")
print()
print(f"{'Q':<4} {'topic':<12} {'oldLen':>7} {'newLen':>7}  diff first 100 chars")
print("-"*100)
focus = {6, 9, 14, 15, 18, 19}
for qid in sorted(new_by_id):
    n = new_by_id[qid]
    o = old_by_id.get(qid, {'answer': '', 'topic': ''})
    mark = ' *' if qid in focus else '  '
    print(f"Q{qid:02d}{mark} {n['topic']:<12} {len(o['answer']):>7} {len(n['answer']):>7}  new={n['answer'][:60]}")
PY
```

预期：能看到每题新旧答案的长度差和片段。

- [ ] **Step 2: 决定是否做主观打分对比**

如果用户要进一步打分对比（沿用 5 月 4 日 / 5 月 6 日的 1/0.5/0 尺度），手工逐题判断。spec 的产出是数据基础，打分由人完成。

---

## Task 8: 提交 PR（可选）

**Files:**
- `apps/client/e2e/kb-bge-large-fullstack.spec.ts`
- `apps/client/e2e/fixtures/.gitignore` （已 ignore 6 份 docx）
- `.changeset/kb-bge-large-fullstack-e2e.md`

- [ ] **Step 1: 切分支**

```bash
cd /root/code/sinopec-knowledge-base
git checkout main
git pull --ff-only origin main
git checkout -b chore/e2e-kb-bge-large-fullstack
```

- [ ] **Step 2: 加 changeset**

```bash
cat > .changeset/kb-bge-large-fullstack-e2e.md <<'EOF'
---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore raptor graphrag bge fullstack -->

chore(e2e): add full-stack chat E2E for a fresh KB on bge-large-zh-v1.5

新增 `apps/client/e2e/kb-bge-large-fullstack.spec.ts`：从零创建一个用
`BAAI/bge-large-zh-v1.5` 做 embedding 的"测试知识库 3"，把 fixtures 下
的全部 docx 上传 + parse 向量化，再创建关联到该 KB 的"聊天助手 3"，
最后跑 `questions.json` 全 20 题真问真答。整套流程都走 sinopec-kb
业务 API，跟用户在 UI 走的路径完全一致，可作"换 embedding 模型"的
横向 A/B 对照实验入口。

`apps/client/e2e/fixtures/` 目录的 `.gitignore` 已经把 docx 排除，
本次不入库实际文件；spec 启动时 `readdirSync` 找 .docx，缺少则用
`README.md` 里的 `mc cp` 命令从 RAGFlow MinIO 复制。
EOF
```

- [ ] **Step 3: stage + commit**

```bash
git add apps/client/e2e/kb-bge-large-fullstack.spec.ts \
  .changeset/kb-bge-large-fullstack-e2e.md
git commit -m "$(cat <<'EOF'
chore(@sinopec-kb/server): 🔨 add full-stack chat E2E for bge-large-zh-v1.5 KB

从零搭一个用 BAAI/bge-large-zh-v1.5 做 embedding 的"测试知识库 3"，
上传 fixtures docx，parse 完后建"聊天助手 3"关联，跑 questions.json
全 20 题真问真答；为换 embedding 模型的 A/B 对照实验提供数据基础。

整套流程都走 sinopec-kb 业务 API，与用户在 UI 走的路径完全一致。
EOF
)"
```

- [ ] **Step 4: push + 开 PR**

```bash
git push -u origin chore/e2e-kb-bge-large-fullstack
gh pr create --base main --head chore/e2e-kb-bge-large-fullstack \
  --title "chore(@sinopec-kb/server): 🔨 add full-stack chat E2E for bge-large-zh-v1.5 KB" \
  --body "新增 \`apps/client/e2e/kb-bge-large-fullstack.spec.ts\`：从零搭一个用 \`BAAI/bge-large-zh-v1.5\` 做 embedding 的"测试知识库 3"，跑完整 chat 流程。具体见 changeset。"
```

- [ ] **Step 5: 等 CI 绿（如有）+ 合并**

```bash
gh pr checks
gh pr merge --squash --delete-branch
```

---

## Self-Review

**Spec 覆盖**：

- 用户要"建测试知识库 3" → Task 3 ✅
- 用户要"模型 BAAI/bge-large-zh-v1.5" → Task 2 + Task 3 ✅
- 用户要"建聊天助手 3" → Task 5 ✅
- 用户要"关联这个知识库" → Task 5 `datasetIds: [newKb.datasetId]` ✅
- 用户要"重新上传这些文件" → Task 1（拉缺失的 3 份） + Task 4（上传 6 份）✅
- 用户要"重新向量化" → Task 4（trigger parse + 轮询）✅
- 用户要"走一遍全流程的测试" → Task 5 跑 questions.json 全 20 题 ✅
- 用户要"端到端测试" → 所有逻辑封装在单文件 spec，Task 8 入库 ✅

**Placeholder 扫描**：所有 step 都有完整代码或精确命令，无 TODO / 待补 / "类似 Task N" 引用。✓

**类型一致性**：
- `KbItem.datasetId` / `CreatedKbResponse.datasetId` 都是 `string?`（通过实测 `GET /api/knowledge-base` 已确认 RAGFlow 返回 32-hex 字符串）
- `LlmItem` 的 `available` 服务端实测返回 `1`（数字）当 truthy 用，类型 `boolean | number` 兼容
- `DocStatus.run` 的终态枚举 `'CANCEL' | 'DONE' | 'FAIL'` 与 PR #14 / #18 spec 一致
- chat 答案 result 字段 `(answer, durationMs, qid, question, timestamp, topic)` 与 PR #23 一致

无类型不一致。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-kb-bge-large-fullstack-e2e.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
