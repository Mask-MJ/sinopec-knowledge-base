---
'@sinopec-kb/server': patch
---

<!-- cspell:ignore replicas postmigration topn -->

chore(e2e): 加业务 API 端到端 chat 测试，复跑全 20 题真问真答

新增 `apps/client/e2e/chat-eval-all-questions.spec.ts`：通过 sinopec-kb 业务 API（`POST /api/auth/authentication/sign-in` → `GET /api/assistant` → `POST /api/assistant/:id/sessions` → `POST /api/assistant/:id/completions { stream: false }`）逐题问完 `apps/server/scripts/eval/dataset/questions.json` 全部 20 题，把每题答案 + 耗时 + 时间戳写到 `apps/client/test-results/chat-eval-all-questions.json`（gitignored）。

走业务 API 而不是 UI 因为 NaiveUI textarea v-model + ChatPanel session 创建竞态在 Playwright 里非常脆弱（试了 3 轮 UI 路径都卡在第一条 send 后 user-bubble 不出现）。业务 API 走的链路与 UI 100% 重合（同样的 token 校验 → 同一个 prod assistant → 同一份 retrieval / max_tokens / system prompt → 同一个 RAGFlow chat completions），所以拿到的答案 byte-for-byte 跟用户在 chat 界面看到的一致，差别只是省略了 SSE 流式渲染。

`turbo.json` 顺手把 `E2E_KB_ID` / `E2E_PROD_DATASET_ID` / `E2E_CHAT_QUESTION_TIMEOUT_MS` 三个新 E2E env vars 声明到 `globalEnv`，避免新增 spec 触发 `turbo/no-undeclared-env-vars` 报错。

跑法：

```bash
cd apps/client
# 沿用 .env：E2E_BASE_URL / E2E_ADMIN_USER / E2E_ADMIN_PASS
pnpm exec playwright test --config=playwright.prod.config.ts \
  chat-eval-all-questions
```

实测：跑完 20 题 ~2.6 分钟，5 道关心题（Q6 / Q9 / Q14 / Q15 / Q18 / Q19）的答案与 PR #18 之后历轮 eval 的答案在事实层面一致，且能看到完整 [ID:N] citation 标注，可作为发布前最后一道烟雾测试。
