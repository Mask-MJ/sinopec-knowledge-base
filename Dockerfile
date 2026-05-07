# ===== Stage 1: Base =====
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /app

# ===== Stage 2: Builder =====
FROM base AS builder

# 先拷贝依赖清单，利用 Docker 缓存层
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY internal/vite-config/package.json internal/vite-config/
COPY internal/tsconfig/package.json internal/tsconfig/
COPY internal/eslint-config/package.json internal/eslint-config/
COPY internal/prettier-config/package.json internal/prettier-config/
COPY internal/commitlint-config/package.json internal/commitlint-config/

# --ignore-scripts 跳过 preinstall/postinstall（避免 only-allow 和 stub 在无源码时失败）
RUN pnpm install --frozen-lockfile --ignore-scripts

# 拷贝全部源码
COPY . .

# 确保客户端 Vite 能读到 VITE_* 变量（仅提取前端部分）
RUN grep '^VITE_' .env > apps/client/.env 2>/dev/null || true

# 有源码后再执行 postinstall (stub) 并构建
# 客户端只做 build-only 跳过 type-check（type-check 应在 CI 中单独做）
RUN pnpm run postinstall \
    && pnpm --filter @sinopec-kb/server run prisma:generate \
    && pnpm --filter @sinopec-kb/server build \
    && pnpm --filter @sinopec-kb/client build-only

# 生成精简的 server 生产依赖（包含 devDeps 中的 prisma CLI）
RUN pnpm --filter @sinopec-kb/server deploy --legacy /app/deploy

# ===== Stage 3: Production =====
FROM node:22-alpine AS production
WORKDIR /app

# pandoc 用于上传 docx 时的预处理（绕开 RAGFlow 0.24 deepdoc DocxParser 的
# 表格 cell 数字丢字 bug，详见 DocxPreprocessService）
RUN apk add --no-cache pandoc

# 拷贝完整的部署目录（含 prisma CLI 及其依赖）
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/package.json ./

# 拷贝后端构建产物
COPY --from=builder /app/apps/server/dist ./dist

# 拷贝 Prisma 生成文件（运行时需要）
COPY --from=builder /app/apps/server/src/prisma/generated ./dist/prisma/generated

# 拷贝 Prisma 迁移相关文件（migrate deploy 需要）
COPY --from=builder /app/apps/server/prisma/migrations ./prisma/migrations
COPY --from=builder /app/apps/server/prisma/models ./prisma/models
COPY --from=builder /app/apps/server/prisma.config.ts ./prisma.config.ts

# 前端构建产物（镜像内固定目录，entrypoint 启动时同步到 /app/public volume）
COPY --from=builder /app/apps/client/dist ./public-src

# 入口脚本：先执行 migrate deploy，再启动应用
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
