/**
 * E2E: log in (UI), create a new KB with chunk_method=manual (UI form),
 * upload three .docx fixtures (UI), trigger parsing via API, poll until
 * every doc reaches DONE/FAIL, and emit a summary file.
 *
 * Goal: produce a manual-parser shadow KB that mirrors part of the prod
 * naive-parser KB so we can grep ES side-by-side and see which root
 * causes (Q6 heading-propagation, Q18/Q19 docx ingestion bug) the manual
 * parser actually fixes.
 *
 * Auth note: sinopec-kb uses JWT in pinia store (no localStorage persist),
 * so `page.request` does NOT inherit the UI session. We open a separate
 * APIRequestContext authenticated via /api/auth/authentication/sign-in.
 *
 * Env vars (loaded from apps/client/.env via @dotenvx/dotenvx in the
 * prod config): E2E_BASE_URL, E2E_ADMIN_USER, E2E_ADMIN_PASS.
 * Optional: E2E_KB_NAME, E2E_PARSE_TIMEOUT_MS.
 *
 * Run:
 *   pnpm exec playwright test --config=playwright.prod.config.ts kb-manual-comparison
 */
import type {
  APIRequestContext,
  Page,
  PlaywrightWorkerArgs,
} from '@playwright/test';

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
const KB_NAME = process.env.E2E_KB_NAME ?? `e2e-manual-${Date.now()}`;
const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const TEST_RESULTS_DIR = resolve(__dirname, '../test-results');
const SUMMARY_FILE = resolve(TEST_RESULTS_DIR, 'kb-manual-comparison.json');
const PARSE_TIMEOUT_MS = Number(process.env.E2E_PARSE_TIMEOUT_MS ?? 600_000);
const POLL_INTERVAL_MS = 3000;

interface KbItem {
  datasetId?: string;
  embeddingModel?: string;
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

test.use({ baseURL: BASE_URL, headless: true });
test.setTimeout(PARSE_TIMEOUT_MS + 120_000);

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

async function loginUi(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('input[placeholder="请输入用户名"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('button:has-text("登录")').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function closeAllPopovers(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

async function selectByLabel(
  page: Page,
  formItemLabelRegex: RegExp,
  optionTextRegex: RegExp,
): Promise<void> {
  await closeAllPopovers(page);
  const trigger = page
    .locator('.n-form-item')
    .filter({
      has: page.locator('.n-form-item-label', { hasText: formItemLabelRegex }),
    })
    .locator('.n-base-selection');
  await trigger.click();
  // only consider currently-visible options (NaiveUI keeps stale lists in DOM)
  const opt = page
    .locator('.n-base-select-menu:visible .n-base-select-option')
    .filter({ hasText: optionTextRegex })
    .first();
  await opt.waitFor({ timeout: 5000 });
  await opt.click();
}

async function fillByLabel(
  page: Page,
  formItemLabelRegex: RegExp,
  value: string,
): Promise<void> {
  const input = page
    .locator('.n-form-item')
    .filter({
      has: page.locator('.n-form-item-label', { hasText: formItemLabelRegex }),
    })
    .locator('input.n-input__input-el, textarea.n-input__textarea-el')
    .first();
  await input.fill(value);
}

async function selectFirstEmbedding(page: Page): Promise<string> {
  await closeAllPopovers(page);
  const trigger = page
    .locator('.n-form-item')
    .filter({
      has: page.locator('.n-form-item-label', {
        hasText: /向量模型|嵌入模型|Embedding/i,
      }),
    })
    .locator('.n-base-selection');
  await trigger.click();
  const first = page
    .locator('.n-base-select-menu:visible .n-base-select-option')
    .first();
  await first.waitFor({ timeout: 5000 });
  const rawLabel = await first.innerText();
  const label = rawLabel.trim();
  await first.click();
  return label;
}

test('create manual-parser KB, upload, parse, wait until DONE', async ({
  page,
  playwright,
}) => {
  const fixtures = readdirSync(FIXTURES_DIR).filter((f) => /\.docx?$/i.test(f));
  expect(
    fixtures.length,
    'fixtures must contain at least one .docx',
  ).toBeGreaterThanOrEqual(1);

  const api = await newAuthedApi(playwright);

  // ── 1. UI login ─────────────────────────────────────────────────────
  await loginUi(page);

  // ── 2. open KB list, click "新增" ────────────────────────────────────
  await page.goto('/knowledgeBase');
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("新增")').first().click();
  await expect(page.locator('.n-modal-mask').last()).toBeVisible();

  // ── 3. fill the form ────────────────────────────────────────────────
  await fillByLabel(page, /知识库名称|名称/, KB_NAME);
  await selectByLabel(page, /权限|Permission/i, /^个人$/);
  const pickedEmbedding = await selectFirstEmbedding(page);
  console.log(`[create] embeddingModel = ${pickedEmbedding}`);
  await selectByLabel(page, /分块方式|Chunk/i, /^Manual$/);

  // ── 3a. fill parser_config to match prod naive KB (fair comparison) ─
  // prod uses: layout_recognize=DeepDOC, chunk_token_num=512, delimiter=\n
  await selectByLabel(page, /PDF解析器|layout_recognize/i, /^DeepDOC$/);
  await fillByLabel(page, /建议分快大小|chunk_token_num/i, '512');
  await fillByLabel(page, /分段标识符|delimiter/i, String.raw`\n`);

  // submit and capture the create response
  const [createResp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/knowledge-base') &&
        r.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.locator('.n-modal button:has-text("确认")').last().click(),
  ]);
  console.log(`[create] HTTP ${createResp.status()} ${createResp.url()}`);
  expect(createResp.status(), 'create must return 2xx').toBeLessThan(400);
  await expect(page.locator('.n-modal-mask').last()).toBeHidden({
    timeout: 10_000,
  });

  // ── 4. find the new KB id by name (via authed API) ──────────────────
  const listResp = await api.get(
    `/api/knowledge-base?page=1&pageSize=50&name=${encodeURIComponent(KB_NAME)}`,
  );
  const listJson = (await listResp.json()) as { list?: KbItem[] };
  const newKb = listJson.list?.find((x) => x.name === KB_NAME);
  if (!newKb) {
    throw new Error(`new KB "${KB_NAME}" did not appear in the list`);
  }
  const kbId = newKb.id;
  const datasetId = newKb.datasetId ?? '';
  console.log(`[create] new KB id=${kbId} datasetId=${datasetId}`);

  // ── 5. enter detail page, upload all fixtures via UI ────────────────
  await page.goto(`/knowledgeBase/detail/${kbId}`);
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("上传")').first().click();
  await expect(page.locator('.n-modal-mask').last()).toBeVisible();

  const fileInput = page.locator('.n-upload input[type="file"]').first();
  await fileInput.setInputFiles(fixtures.map((f) => resolve(FIXTURES_DIR, f)));

  const [uploadResp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/knowledge-base/${kbId}/documents`) &&
        r.request().method() === 'POST',
      { timeout: 60_000 },
    ),
    page.locator('.n-modal button:has-text("确认")').last().click(),
  ]);
  console.log(`[upload] HTTP ${uploadResp.status()}`);
  expect(uploadResp.status(), 'upload must return 2xx').toBeLessThan(400);
  await expect(page.locator('.n-modal-mask').last()).toBeHidden({
    timeout: 30_000,
  });

  // ── 6. trigger parse via API for every doc ──────────────────────────
  const docsResp = await api.get(
    `/api/knowledge-base/${kbId}/documents?page=1&pageSize=50`,
  );
  const docsJson = (await docsResp.json()) as { docs?: DocStatus[] };
  const docs = docsJson.docs ?? [];
  expect(
    docs.length,
    'every fixture should be uploaded',
  ).toBeGreaterThanOrEqual(fixtures.length);
  const docIds = docs.map((d) => d.id);

  const parseResp = await api.post(`/api/knowledge-base/${kbId}/parse`, {
    data: { documentIds: docIds },
  });
  expect(
    parseResp.ok(),
    `parse trigger must succeed (got ${parseResp.status()})`,
  ).toBe(true);
  console.log(`[parse] triggered for ${docIds.length} docs`);

  // ── 7. poll until every doc reaches a terminal state ────────────────
  const start = Date.now();
  let snapshot: DocStatus[] = [];
  while (Date.now() - start < PARSE_TIMEOUT_MS) {
    const r = await api.get(
      `/api/knowledge-base/${kbId}/documents?page=1&pageSize=50`,
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
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  // ── 8. emit summary for the verify step ─────────────────────────────
  if (!existsSync(TEST_RESULTS_DIR))
    mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  const summary = {
    kbId,
    kbName: KB_NAME,
    datasetId,
    embeddingModel: pickedEmbedding,
    chunkMethod: 'manual',
    docs: snapshot.map((d) => ({
      id: d.id,
      name: d.name,
      run: d.run,
      progress: d.progress,
      chunkCount: d.chunk_count,
    })),
    timestamp: new Date().toISOString(),
  };
  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log(`[summary] ${SUMMARY_FILE}`);
  console.log(JSON.stringify(summary, null, 2));

  await api.dispose();

  // ── 9. assertions ───────────────────────────────────────────────────
  const failed = snapshot.filter((d) => d.run === 'FAIL');
  expect(
    failed.map((d) => `${d.name}: ${d.progress_msg ?? ''}`),
    'no doc should fail to parse',
  ).toEqual([]);
  expect(
    snapshot.filter((d) => d.run === 'DONE').length,
    'every doc should reach DONE',
  ).toBe(snapshot.length);
});
