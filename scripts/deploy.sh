#!/usr/bin/env bash
# 在部署机本机执行：拉代码 → 备份库 → 构建 → 替换 app → 等健康检查，失败回滚镜像。
#
#   cd /var/www/sinopec-knowledge-base && bash scripts/deploy.sh [分支，默认 main]
#
# 与 .github/workflows/deploy.yml 的区别：那条流水线部署的是固定用 -p sinopec-kb
# 的机器；这里从现役容器读 compose 项目名，避免在 210 这类按目录名起项目的机器上
# 建出一套新的（空的）数据卷。
set -Eeuo pipefail

REF="${1:-main}"
REMOTE="${REMOTE:-origin}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/sinopec-kb-backups}"
APP=sinopec-kb-app
DB=sinopec-kb-postgres

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."

# ── 前置检查 ────────────────────────────────────
command -v docker >/dev/null || die "未找到 docker"
docker compose version >/dev/null || die "docker compose 不可用（或当前用户无 docker 权限）"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$PWD 不是 git 仓库"
[[ -f .env ]] || die "缺少 .env"

# 应用依赖 RAGFlow 0.26+ 的 /api/v1/* 接口；0.24 没有这个路径，会返回 404
ragflow_host="$(sed -n 's/^RAGFLOW_HOST=//p' .env | tail -1 | tr -d "\"'")"
if [[ -n "$ragflow_host" ]]; then
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$ragflow_host/api/v1/system/healthz" || true)"
  [[ "$code" != 404 ]] || die "RAGFlow（$ragflow_host）低于 0.26，先升级 RAGFlow 再部署应用"
  [[ "$code" == 200 ]] || log "警告：RAGFlow 健康检查返回 ${code}，继续部署"
fi

branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
[[ "$branch" == "$REF" ]] || die "当前分支是 '${branch:-detached}'，与要部署的 '$REF' 不一致"

if ! git diff --quiet HEAD --; then
  git status --short
  die "工作区有未提交改动，先处理再部署（避免被覆盖）"
fi

# 从现役容器取项目名与镜像；目录不一致说明跑错了副本。
# --type container 不能省：不加时 docker inspect 会匹配到同名镜像（CI 用
# -p sinopec-kb 构建出的镜像正好叫 sinopec-kb-app），读出空标签。
PROJECT="$(basename "$PWD")"
IMAGE=""
if docker inspect --type container "$APP" >/dev/null 2>&1; then
  PROJECT="$(docker inspect --type container -f '{{index .Config.Labels "com.docker.compose.project"}}' "$APP")"
  running_dir="$(docker inspect --type container -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$APP")"
  [[ -n "$PROJECT" && -n "$running_dir" ]] || die "容器 $APP 没有 compose 标签（不是 compose 起的？），人工确认后再部署"
  [[ "$(realpath -m "$running_dir")" == "$(pwd -P)" ]] || die "现役容器来自 $running_dir，不是当前目录 $PWD"
  IMAGE="$(docker inspect --type container -f '{{.Config.Image}}' "$APP")"
fi
export COMPOSE_PROJECT_NAME="$PROJECT"
log "compose 项目：$PROJECT"

# ── 拉代码 ──────────────────────────────────────
OLD="$(git rev-parse HEAD)"
git fetch "$REMOTE" "$REF" \
  || die "git fetch $REMOTE 失败。210 出口封了 GitHub，remote 要指向 gitee；没过上网认证时也会失败"
git merge --ff-only FETCH_HEAD || die "无法快进合并，本地分支与 $REMOTE/$REF 已分叉"
NEW="$(git rev-parse HEAD)"
log "代码：${OLD:0:7} → ${NEW:0:7}"
git log --oneline -20 "$OLD..$NEW"  # 别接 | head：pipefail 下 SIGPIPE 会让脚本退出

# ── 备份数据库（entrypoint 会自动 migrate deploy，迁移不可逆）──
if docker inspect --type container "$DB" >/dev/null 2>&1; then
  mkdir -p "$BACKUP_DIR"
  dump="$BACKUP_DIR/sinopec-$(date +%Y%m%d-%H%M%S)-${OLD:0:7}.sql.gz"
  # shellcheck disable=SC2016  # 变量要在容器内展开
  (umask 077 && docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip >"$dump")
  log "数据库已备份：$dump ($(du -h "$dump" | cut -f1))"
fi

# ── 构建 & 替换 ─────────────────────────────────
ROLLBACK=""
if [[ -n "$IMAGE" ]]; then
  ROLLBACK="${IMAGE%:*}:rollback"
  docker tag "$(docker inspect --type container -f '{{.Image}}' "$APP")" "$ROLLBACK"
fi

# nice：同机还跑着 RAGFlow / ES / MySQL
log "构建 app 镜像"
nice -n 10 docker compose build app

log "替换 app 容器"
docker compose up -d --no-deps app

log "等待健康检查（最多 5 分钟，含 prisma migrate deploy）"
st=starting
for _ in $(seq 1 60); do
  st="$(docker inspect --type container -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo starting)"
  [[ "$st" == healthy ]] && break
  sleep 5
done

if [[ "$st" != healthy ]]; then
  docker logs --tail 80 "$APP" || true
  if [[ -n "$ROLLBACK" ]]; then
    docker tag "$ROLLBACK" "$IMAGE"
    docker compose up -d --no-deps app
    die "健康检查未通过（$st），已回滚到旧镜像。数据库迁移不会随之回滚，备份见 ${dump:-无}"
  fi
  die "健康检查未通过（$st），且无旧镜像可回滚"
fi

# nginx 的 default.conf 是单文件 bind mount，git 换文件后容器仍看旧 inode，必须重建
if ! git diff --quiet "$OLD" "$NEW" -- docker/nginx; then
  log "nginx 配置有变更，重建 nginx"
  docker compose up -d --no-deps --force-recreate nginx
fi

# ponytail: 基础设施不自动重建，postgres/minio 重建有停机和数据风险，留给人判断
if ! git diff --quiet "$OLD" "$NEW" -- docker-compose.yaml docker-compose.infra.yaml; then
  log "注意：compose 文件有变更，只更新了 app/nginx，其余服务请人工确认后再 up"
fi

docker image prune -f --filter 'until=168h' >/dev/null || true
log "部署成功：${NEW:0:7}"
