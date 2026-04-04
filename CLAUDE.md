# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sinopec Knowledge Base — 中石化知识库管理系统。Turborepo monorepo，前后端分离架构，集成 RAGFlow 作为 RAG 引擎。

## Commands

```bash
# 安装依赖（仅允许 pnpm）
pnpm install

# 启动基础设施（PostgreSQL 17 / Redis 7 / MinIO）
pnpm docker:dev          # 启动
pnpm docker:dev:down     # 停止

# 开发
pnpm dev                 # 同时启动前后端
pnpm dev:server          # 仅后端 (localhost:3001)
pnpm dev:client          # 仅前端 (localhost:3100)

# 构建 & 检查
pnpm build               # turbo build
pnpm check               # knip + typecheck + cspell 一次性检查
pnpm check:type          # 仅类型检查 (turbo run typecheck)
pnpm lint                # turbo lint (eslint --fix)
pnpm format              # turbo format (prettier --write)

# 测试 (vitest)
pnpm test                              # 全量
pnpm -F @sinopec-kb/server test        # 仅后端
pnpm -F @sinopec-kb/client test        # 仅前端
pnpm -F @sinopec-kb/server test:e2e    # 后端 E2E
pnpm -F @sinopec-kb/client test:e2e    # 前端 E2E (Playwright)

# 运行单个测试文件
pnpm -F @sinopec-kb/server vitest run src/modules/auth/auth.service.spec.ts

# Prisma
pnpm -F @sinopec-kb/server prisma:dev       # 创建/应用迁移
pnpm -F @sinopec-kb/server prisma:generate  # 生成客户端
pnpm -F @sinopec-kb/server prisma:studio    # 可视化数据

# OpenAPI 类型生成（需后端运行中）
pnpm -F @sinopec-kb/client openapi
```

## Architecture

### Monorepo Structure

- `apps/server` — NestJS 后端 (CommonJS, SWC 编译, port 3001)
- `apps/client` — Vue 3 前端 (Vite, Naive UI, UnoCSS, port 3100)
- `internal/` — 共享配置包 (eslint-config, tsconfig, prettier-config, vite-config, commitlint-config)

### Server Architecture (`apps/server`)

**NestJS + Prisma + PostgreSQL**，使用 `@dotenvx/dotenvx` 管理环境变量。

路由通过 `RouterModule.register()` 在 `app.module.ts` 中集中注册，所有 API 挂载在 `/api` 前缀下：

| 路由前缀 | 模块 | 说明 |
|----------|------|------|
| `/auth` | AuthModule | JWT 认证 |
| `/system` | SystemModule | 用户/角色/菜单/部门/岗位/字典 |
| `/monitor` | MonitorModule | 操作日志/登录日志/系统信息 |
| `/knowledge-base` | KnowledgeBaseModule | 知识库管理 |
| `/assistant` | AssistantModule | AI 助手 |

**Common 层** (`src/common/`)：
- `config/` — 环境变量验证 (class-validator)，启动时校验所有必需环境变量
- `database/` — Prisma 扩展客户端，集成 `prisma-extension-pagination` 和 `@prisma/adapter-pg` (连接池)
- `ragflow/` — RAGFlow API 封装 (HTTP client)
- `minio/` — MinIO 对象存储服务
- `logger/` — Winston 日志
- `bootstrap/` — 应用初始化和 Swagger 配置
- `filters/` / `response/` — 异常过滤器和分页响应

**Prisma 配置**：
- Schema 拆分为多文件：`prisma/models/*.prisma`
- 生成目标：`src/prisma/generated/`
- 启用 `typedSql` preview feature
- 使用 `PrismaPg` adapter (非默认引擎)
- 通过 `nestjs-prisma` 的 `CustomPrismaModule` 注入，注入 token 为 `'PrismaService'`

### Client Architecture (`apps/client`)

**Vue 3 + Pinia + Vue Router + Naive UI**

- `src/api/` — API 层，使用 `openapi-fetch` + 从 Swagger JSON 自动生成的 `types/openapi.d.ts` 类型
- `src/views/` — 页面组件
- `src/stores/` — Pinia 状态管理
- `src/composables/` — Vue 组合式函数
- `src/router/` — 路由配置
- `src/locales/` — i18n 国际化

### External Services

- **RAGFlow** — RAG 引擎，通过 HTTP API 集成 (`RAGFLOW_HOST` / `RAGFLOW_API_KEY`)
- **MinIO** — 对象存储，用于文件上传
- **Redis** — 缓存层 (`@nestjs/cache-manager` + `@keyv/redis`)

## Key Conventions

- **环境变量**：复制 `.env.example` 为 `.env`，服务端使用 `@dotenvx/dotenvx` 加载
- **Swagger 文档**：`http://localhost:3001/doc/`，SWC 编译器需要预生成 metadata (`src/metadata.ts`)
- **Git Hooks**：Lefthook — pre-commit 并行执行 prettier + eslint + cspell，commit-msg 执行 commitlint
- **包管理**：pnpm 10 workspace + catalog 协议管理依赖版本
- **拼写检查**：cspell 检查 `.ts` 和 `.md` 文件
- **死代码检测**：knip 检查未使用的依赖和导出