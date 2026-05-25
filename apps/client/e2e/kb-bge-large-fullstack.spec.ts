// cspell:ignore tiktoken
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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
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
const ASSISTANT_NAME = process.env.E2E_NEW_ASSISTANT_NAME ?? '聊天助手 3';
const EMBEDDING_HINT = process.env.E2E_EMBEDDING_HINT ?? 'bge-large-zh-v1.5';

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
const POLL_INTERVAL_MS = 3000;

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

test('fullstack: create KB → upload → parse → create assistant → chat 20Q', async ({
  playwright,
}) => {
  const api = await newAuthedApi(playwright);

  // ── 1. find embedding id ────────────────────────────────────────────
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
  // bge-large-zh-v1.5 hard-caps at 512 tokens, and the bge tokenizer
  // counts Chinese ~1.5–2× heavier than tiktoken (which RAGFlow uses
  // for chunk_token_num). Drop to 128 and broaden delimiter to also
  // split at sentence punctuation so single long Chinese paragraphs
  // get cut at 句号/感叹号/问号 instead of sliding past 512 bge tokens.
  const createKb = await api.post('/api/knowledge-base', {
    data: {
      name: KB_NAME,
      permission: 'me',
      chunkMethod: 'naive',
      embeddingModel: embeddingId,
      parserConfig: {
        chunk_token_num: 128,
        delimiter: '\n。！？!?.',
      },
    },
  });
  const createKbText = createKb.ok() ? '' : await createKb.text();
  const createKbBody = createKbText.slice(0, 200);
  expect(
    createKb.ok(),
    `KB create failed: ${createKb.status()} ${createKbBody}`,
  ).toBe(true);
  const newKb = (await createKb.json()) as CreatedKbResponse;
  console.log(
    `[create] KB id=${newKb.id} datasetId=${newKb.datasetId} name=${newKb.name}`,
  );
  expect(newKb.id).toBeGreaterThan(0);
  expect(
    newKb.datasetId,
    'datasetId must come back from RAGFlow',
  ).toBeDefined();

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
  const uploadText = uploadResp.ok() ? '' : await uploadResp.text();
  const uploadBody = uploadText.slice(0, 200);
  expect(
    uploadResp.ok(),
    `upload failed: ${uploadResp.status()} ${uploadBody}`,
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
  expect(parseResp.ok(), `parse trigger failed: ${parseResp.status()}`).toBe(
    true,
  );
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
  const createAsstText = createAsst.ok() ? '' : await createAsst.text();
  const createAsstBody = createAsstText.slice(0, 200);
  expect(
    createAsst.ok(),
    `assistant create failed: ${createAsst.status()} ${createAsstBody}`,
  ).toBe(true);
  const asst = (await createAsst.json()) as { id: number; name: string };
  console.log(`[create] assistant id=${asst.id} name=${asst.name}`);

  // ── 8. create a fresh session ──────────────────────────────────────
  const sessionResp = await api.post(`/api/assistant/${asst.id}/sessions`, {
    data: { name: `bge-large-${Date.now()}` },
  });
  expect(sessionResp.ok()).toBe(true);
  const session = (await sessionResp.json()) as { id: string };
  console.log(`[session] id=${session.id}`);

  // ── 9. iterate every question via business completions API ──────────
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
