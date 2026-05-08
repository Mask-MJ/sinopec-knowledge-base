/**
 * E2E (business-API): log in via the sinopec-kb business API, find the prod
 * assistant wired to the prod KB, create a fresh chat session, then send
 * every question from `apps/server/scripts/eval/dataset/questions.json` via
 * `POST /api/assistant/:id/completions { stream: false }` and collect
 * answers + the citation chunks the LLM saw.
 *
 * Why API rather than UI: NaiveUI textarea v-model + ChatPanel session
 * lifecycle made UI-driven Playwright runs flaky (3 attempts, all stuck on
 * empty user-bubble after first send). The business endpoint goes through
 * the same auth → same prod assistant → same RAGFlow chat completions →
 * same retrieval / max_tokens / system prompt as the UI, so the answer
 * text is byte-for-byte identical to what a user sees on screen — only the
 * rendering layer is skipped.
 *
 * Env vars (loaded from apps/client/.env via @dotenvx/dotenvx in the prod
 * config): E2E_BASE_URL, E2E_ADMIN_USER, E2E_ADMIN_PASS.
 *
 * Run:
 *   pnpm exec playwright test --config=playwright.prod.config.ts \
 *     chat-eval-all-questions
 */
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const PROD_DATASET_ID =
  process.env.E2E_PROD_DATASET_ID ?? '6ec4cd18476611f1a9b8932ed31a3307';
const QUESTIONS_PATH = resolve(
  __dirname,
  '../../server/scripts/eval/dataset/questions.json',
);
const TEST_RESULTS_DIR = resolve(__dirname, '../test-results');
const SUMMARY_FILE = resolve(TEST_RESULTS_DIR, 'chat-eval-all-questions.json');
const PER_QUESTION_TIMEOUT_MS = Number(
  process.env.E2E_CHAT_QUESTION_TIMEOUT_MS ?? 90_000,
);

interface QuestionRow {
  id: number;
  question: string;
  topic: string;
}
interface QuestionsFile {
  questions: QuestionRow[];
}
interface AssistantItem {
  datasetIds: string[];
  id: number;
  name: string;
}
interface SessionResponse {
  id: string;
  name?: string;
}
interface CompletionsResponse {
  answer?: string;
  reference?: unknown;
  session_id?: string;
}

test.use({ baseURL: BASE_URL });
test.setTimeout(20 * PER_QUESTION_TIMEOUT_MS + 60_000);

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

test('chat through every question via business API end-to-end', async ({
  playwright,
}) => {
  // ── 0. preconditions ────────────────────────────────────────────────
  if (!existsSync(TEST_RESULTS_DIR))
    mkdirSync(TEST_RESULTS_DIR, { recursive: true });

  const file = JSON.parse(
    readFileSync(QUESTIONS_PATH, 'utf8'),
  ) as QuestionsFile;
  const questions = file.questions;
  expect(
    questions.length,
    'questions.json must contain at least one question',
  ).toBeGreaterThan(0);
  console.log(`[plan] ${questions.length} questions to chat through`);

  // ── 1. authed API context ───────────────────────────────────────────
  const api = await newAuthedApi(playwright);

  // ── 2. find the prod assistant business id ──────────────────────────
  const listResp = await api.get('/api/assistant?page=1&pageSize=50');
  const listJson = (await listResp.json()) as { list?: AssistantItem[] };
  const all = listJson.list ?? [];
  const wired = all.find((a) => a.datasetIds.includes(PROD_DATASET_ID));
  if (!wired) {
    throw new Error(`no assistant wired to dataset ${PROD_DATASET_ID}`);
  }
  console.log(`[discover] using assistant id=${wired.id} name="${wired.name}"`);

  // ── 3. create a fresh chat session ──────────────────────────────────
  const sessionResp = await api.post(`/api/assistant/${wired.id}/sessions`, {
    data: { name: `e2e-chat-${Date.now()}` },
  });
  expect(
    sessionResp.ok(),
    `session create failed: ${sessionResp.status()}`,
  ).toBe(true);
  const session = (await sessionResp.json()) as SessionResponse;
  console.log(`[session] id=${session.id}`);

  // ── 4. iterate every question ───────────────────────────────────────
  interface Result {
    answer: string;
    durationMs: number;
    qid: number;
    question: string;
    timestamp: string;
    topic: string;
  }
  const results: Result[] = [];

  for (const q of questions) {
    const tag = `Q${String(q.id).padStart(2, '0')}`;
    console.log(`[ask] ${tag} ${q.topic} :: ${q.question.slice(0, 40)}…`);
    const start = Date.now();

    const resp = await api.post(`/api/assistant/${wired.id}/completions`, {
      data: {
        question: q.question,
        sessionId: session.id,
        stream: false,
      },
      timeout: PER_QUESTION_TIMEOUT_MS,
    });

    if (!resp.ok()) {
      const body = await resp.text();
      console.warn(
        `[got]  ${tag} HTTP ${resp.status()}  body=${body.slice(0, 120)}`,
      );
      results.push({
        qid: q.id,
        topic: q.topic,
        question: q.question,
        answer: `__ERROR__ HTTP ${resp.status()} ${body.slice(0, 200)}`,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const payload = (await resp.json()) as CompletionsResponse;
    const answer = (payload.answer ?? '').trim();
    const durationMs = Date.now() - start;
    results.push({
      qid: q.id,
      topic: q.topic,
      question: q.question,
      answer,
      durationMs,
      timestamp: new Date().toISOString(),
    });
    console.log(`[got]  ${tag} ${durationMs}ms answer=${answer.slice(0, 60)}…`);
  }

  // ── 5. emit summary ─────────────────────────────────────────────────
  writeFileSync(
    SUMMARY_FILE,
    JSON.stringify(
      {
        assistantId: wired.id,
        assistantName: wired.name,
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

  // ── 6. assertions ───────────────────────────────────────────────────
  expect(results.length, 'every question must be answered').toBe(
    questions.length,
  );
  const failures = results.filter((r) => r.answer.startsWith('__ERROR__'));
  expect(
    failures.map((f) => `${f.qid}: ${f.answer}`),
    'no completions request should fail',
  ).toEqual([]);
  for (const r of results) {
    expect(
      r.answer.length,
      `Q${r.qid} answer should be non-empty`,
    ).toBeGreaterThan(0);
  }
});
