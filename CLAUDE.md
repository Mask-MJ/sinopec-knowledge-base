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

## Deployment

生产环境是**单机 Docker Compose**，无 K8s、无镜像仓库。

### 运行拓扑

`docker-compose.yaml`（include `docker-compose.infra.yaml`）起 5 个容器，同处 `sinopec-kb` bridge 网络：

| 容器 | 说明 |
|------|------|
| `sinopec-kb-nginx` | 唯一对外端口 `${NGINX_PORT:-80}`，反代 `/api/` 到 app + 托管前端静态资源 |
| `sinopec-kb-app` | NestJS 后端 (3001)，不直接暴露端口 |
| `sinopec-kb-postgres` / `-redis` / `-minio` | 基础设施，dev 环境用 `pnpm docker:dev` 单独起同一份 infra 文件 |

- compose 里的 `DATABASE_HOST` / `REDIS_HOST` / `MINIO_ENDPOINT` 等会**覆盖 `.env` 中的 host**为 Docker 服务名，`.env` 里写的是本机开发用的值。
- 前端产物不由 nginx 镜像携带：app 容器 entrypoint 启动时把 `/app/public-src` 同步到 `app_public` volume，nginx 只读挂载该 volume。所以**前端更新也要重建 app 镜像**。

### 镜像构建（`Dockerfile`）

三阶段 (base / builder / production)：先只拷 `package.json` 装依赖吃 Docker 层缓存 → 拷源码构建后端 + 前端 (`build-only`，跳过 type-check) → `pnpm deploy --legacy` 生成精简 server 依赖树（含 prisma CLI）。production 阶段装 `pandoc`（DocxPreprocessService 预处理用），apk 源已切清华镜像（官方源在中石化内网会 hang）。

### 启动流程（`docker/entrypoint.sh`）

同步前端产物到 volume → `prisma migrate deploy` → `node dist/main.js`。迁移在容器启动时自动执行，不需要人工介入。

### nginx（`docker/nginx/default.conf`）

改这个文件前注意两条已踩坑的配置：`/api/` 下 **`proxy_buffering off`**（否则 SSE 最后一条带 reference 的大消息会被 nginx 缓冲吞掉），以及 `proxy_read_timeout 600s`（LLM 生成可能 1-3 分钟）。

### CI/CD（`.github/workflows/deploy.yml`）

push `main` 或手动 `workflow_dispatch` 触发。**runner 只当触发器，构建在目标机器上做**——镜像 1.58GB 而目标机器拉取只有 35KB/s，传镜像要 6 小时，改成目标机 `git pull` 后本地构建只要几秒同步 + 增量编译。

流程：SSH 到目标机 → `/opt/sinopec-kb-src` 下 `git reset --hard origin/<ref>` → 给现役镜像打 `:rollback` tag → `nice -n 10 docker compose -p sinopec-kb build app`（降优先级避免抢占同机的 RAGFlow / ES / MySQL）→ `up -d app` → 轮询 healthcheck 最多 5 分钟 → 不健康则回滚到 `:rollback` 并 exit 1。

需要的 secrets：`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`。健康检查端点是 `GET /api/monitor/health`。

## Key Conventions

- **环境变量**：复制 `.env.example` 为 `.env`，服务端使用 `@dotenvx/dotenvx` 加载
- **Swagger 文档**：`http://localhost:3001/doc/`，SWC 编译器需要预生成 metadata (`src/metadata.ts`)
- **Git Hooks**：Lefthook — pre-commit 并行执行 prettier + eslint + cspell，commit-msg 执行 commitlint
- **包管理**：pnpm 10 workspace + catalog 协议管理依赖版本
- **拼写检查**：cspell 检查 `.ts` 和 `.md` 文件
- **死代码检测**：knip 检查未使用的依赖和导出