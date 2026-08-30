import process from 'node:process';

import { defineConfig, devices } from '@playwright/test';

import '@dotenvx/dotenvx/config';

/**
 * Playwright config for running E2E tests against a deployed environment
 * (no local dev server, uses the system-installed Chrome instead of the
 * Playwright-managed Chromium). Loads `apps/client/.env` via `@dotenvx/dotenvx`,
 * so `E2E_BASE_URL` / `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` should be defined
 * there (see `.env.example`). Never commit a real `.env`.
 *
 * Run:
 *   pnpm exec playwright test --config=playwright.prod.config.ts probe-kb-form
 */
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error('E2E_BASE_URL must be set (see apps/client/.env.example)');
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // 目标环境带宽差异很大（内网/公网 ECS），大附件上传 30s 常不够；
    // 用 E2E_ACTION_TIMEOUT_MS 覆盖。
    actionTimeout: Number(process.env.E2E_ACTION_TIMEOUT_MS ?? 30_000),
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chrome-system',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
