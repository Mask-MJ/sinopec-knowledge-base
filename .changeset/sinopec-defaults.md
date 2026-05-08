---
'@sinopec-kb/server': minor
---

<!-- cspell:ignore raptor graphrag DeepDOC RAGFlow disambiguation -->

feat: 把生产已落地的中石化勘探域调优参数沉淀为业务层默认值，新机器开箱即用

之前 PR #14 → #23 把一套调优后的助手 / KB 配置 PUT 到了 prod RAGFlow 实例上：

- assistant: `top_n=10`、`max_tokens=1024`、`temperature=0.1` 等 retrieval/LLM 参数 + 一份 923 字符的"中石化勘探技术报告专业助手"system prompt（含"列举完整 / 数字精确 / 区分试验段 vs 全工区 / 不知道就说不知道 / 日期类 disambiguation"等领域规则）
- KB parser_config: `layout_recognize='DeepDOC'`、`chunk_token_num=512`、`delimiter='\n'`，以及可选的 RAPTOR / GraphRAG

但这些都没沉淀进代码——新机器部署后 `CreateAssistantDto` / `CreateKnowledgeBaseDto` 的默认值仍是 RAGFlow 出厂的 `top_n=6` / `max_tokens=512` / 空 prompt / 空 parser_config，运维需要手动跑 ops 脚本把这套调优重新 PUT 一次才能复刻线上效果。

本 PR 把这两份默认值固化进代码，新机器构建出的镜像里：

- 任何用户在 UI / API 创建新助手 → 自动拿到上述 sinopec 调优参数 + 完整 system prompt
- 任何用户创建新 KB → service 浅合并 `DEFAULT_KB_PARSER_CONFIG` 与用户传入字段，DeepDOC + chunk_token_num=512 / delimiter='\n' 自动到位

## 文件改动

- `apps/server/src/common/defaults/assistant.defaults.ts`（新增）— 全部 retrieval/LLM 参数常量 + 完整 system prompt 模板字符串
- `apps/server/src/common/defaults/knowledge-base.defaults.ts`（新增）— `DEFAULT_KB_PARSER_CONFIG`，RAPTOR / GraphRAG 默认 OFF（先前的 OOM 让我把它降级为 opt-in），通过 env `KB_DEFAULT_RAPTOR=1` / `KB_DEFAULT_GRAPHRAG=1` 显式打开
- `apps/server/src/modules/assistant/assistant.dto.ts` — 10 个字段的字面量默认值替换为 import 自 defaults（行为不变，但单一事实源）
- `apps/server/src/modules/knowledge-base/knowledge-base.dto.ts` — `parserConfig` JSDoc 写明 service 层会浅合并 `DEFAULT_KB_PARSER_CONFIG`
- `apps/server/src/modules/knowledge-base/knowledge-base.service.ts` `create()` — 把 `dto.parserConfig` 改成 `{ ...DEFAULT_KB_PARSER_CONFIG, ...dto.parserConfig }` 浅合并后再 PUT 给 RAGFlow
- `turbo.json` `globalEnv` 加 `KB_DEFAULT_RAPTOR` / `KB_DEFAULT_GRAPHRAG`

## 不在本 PR

- 不会重写已经存在的 prod assistant / prod KB 配置（那是一次性 ops 操作，PR #20 的 `update-prod-assistant-prompt.sh` 已经做完）。
- 不替线上现有用户已经创建的 KB / 助手做迁移；只影响**新建**。

## Test Plan

- [x] `pnpm exec tsc --noEmit` (server) — clean
- [x] `pnpm exec eslint --max-warnings=0` 新增 / 修改文件 — clean
- [x] cspell + commitlint hooks — clean

新机器部署后验证一次：UI 新建 KB / 新建助手不传可选字段，落到 RAGFlow 的配置应跟当前 prod assistant `b7e94c58` / prod KB `6ec4cd18` 在 retrieval/LLM 参数 + parser_config 层面一致。
