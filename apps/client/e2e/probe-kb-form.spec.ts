/**
 * Production probe: log in, open the "Add Knowledge Base" modal,
 * dump the chunk-method dropdown options, and screenshot the form.
 *
 * Goal: figure out whether the production UI already has the dict-driven
 * dropdown + the chunkMethod field-name fix (commits b2413e0 / 01e55e6),
 * before committing to the full create-upload-parse flow.
 *
 * Env vars (loaded from apps/client/.env via @dotenvx/dotenvx in the
 * prod config): E2E_BASE_URL, E2E_ADMIN_USER, E2E_ADMIN_PASS.
 *
 * Run:
 *   pnpm -F @sinopec-kb/client exec playwright test \
 *     --config=playwright.prod.config.ts probe-kb-form
 */
import { expect, test } from '@playwright/test';

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

test.use({ baseURL: BASE_URL, headless: true });
test.setTimeout(60_000);

test('probe production KB form: dump chunk-method dropdown + screenshot', async ({
  page,
}) => {
  // 1. login
  await page.goto('/');
  await page.locator('input[placeholder="请输入用户名"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('button:has-text("登录")').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // 2. navigate to KB list (route from router config: /knowledgeBase)
  await page.goto('/knowledgeBase');
  await page.waitForLoadState('networkidle');

  // 3. open "Add" modal
  await page.locator('button:has-text("新增")').first().click();

  // wait for modal: pro-modal-form renders an n-modal containing the form
  const modal = page.locator('.n-modal-mask, .n-drawer-mask').last();
  await expect(modal).toBeVisible({ timeout: 5000 });

  // 4. find the chunk-method select. label text comes from i18n
  //    page.knowledgeBase.chunk_method.title — should render "分块方式".
  //    NaiveUI ProSelect renders an n-select with a clickable trigger.
  const chunkLabel = page
    .locator('.n-form-item-label')
    .filter({ hasText: /分块|Chunk/ });
  const chunkRow = chunkLabel.locator('xpath=..');
  const chunkSelect = chunkRow.locator('.n-base-selection');
  await chunkSelect.click();

  // dropdown options render in a teleport, not inside the modal
  const optionItems = page.locator('.n-base-select-option');
  await optionItems.first().waitFor({ timeout: 5000 });
  const labels = await optionItems.allInnerTexts();

  console.log('=== chunk-method options found in production UI ===');
  for (const l of labels) console.log(`  - ${l}`);
  console.log(`=== total: ${labels.length} options ===`);

  // 5. screenshot the modal for visual confirmation
  await page.screenshot({
    path: 'test-results/probe-kb-form.png',
    fullPage: true,
  });

  // 6. assertion: 'manual' must be selectable (case-insensitive match on label)
  const hasManual = labels.some((l) => /manual/i.test(l));
  expect(hasManual, 'production UI must expose a "manual" chunk-method').toBe(
    true,
  );
});
