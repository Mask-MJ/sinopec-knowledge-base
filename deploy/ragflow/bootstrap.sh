#!/usr/bin/env bash
# 在干净机器上部署 RAGFlow v0.27.1 并配好模型，可重复执行（每步先查后建）。
#
#   bash deploy/ragflow/bootstrap.sh
#
# 做四件事：把配置铺到部署目录（首次生成随机密码）→ 起容器 → 注册管理员 →
# 配 Xinference 的 chat / embedding 两个模型并设为默认 → 生成给应用用的 API key。
#
# 模型按内网规范登记成 chat@Xinference 和 embedding@Xinference：RAGFlow 里只认这两个
# 名字，底层换模型不用动 RAGFlow 配置，已建的知识库和对话也不受影响。
set -Eeuo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DIR="${RAGFLOW_DIR:-/var/www/ragflow/docker}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@sinopec.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"   # 不设默认口令，没传就随机生成
MODEL_BASE_URL="${MODEL_BASE_URL:-http://10.55.247.252:19997}"
INSTANCE="${INSTANCE_NAME:-xinference-252}"
PROVIDER=Xinference
CHAT_MAX_TOKENS="${CHAT_MAX_TOKENS:-131072}"
EMBED_MAX_TOKENS="${EMBED_MAX_TOKENS:-8192}"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

# 取 JSON 里的字段：jget <<<"$resp" data token
jget() { python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
for k in sys.argv[1:]:
    if isinstance(d, list): d = d[int(k)] if len(d) > int(k) else None
    elif isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print("" if d is None else (d if not isinstance(d, (dict, list)) else json.dumps(d, ensure_ascii=False)))
' "$@"; }

# 调控制台 API，code 非 0 就报错退出；$1=方法 $2=路径 $3=body（可空）
api() {
  local method=$1 path=$2 body=${3:-} resp code
  if [[ -n "$body" ]]; then
    resp=$(curl -sS -X "$method" "$API$path" -H "Authorization: $TOKEN" \
           -H 'Content-Type: application/json' -d "$body")
  else
    resp=$(curl -sS -X "$method" "$API$path" -H "Authorization: $TOKEN")
  fi
  code=$(jget code <<<"$resp" 2>/dev/null || echo "")
  [[ "$code" == 0 || -z "$code" ]] || die "$method $path 失败：$(jget message <<<"$resp")"
  printf '%s' "$resp"
}

command -v docker >/dev/null || die "未找到 docker"
command -v curl >/dev/null || die "未找到 curl"
command -v python3 >/dev/null || die "未找到 python3（脚本用它解析 JSON）"
docker compose version >/dev/null || die "docker compose 不可用（或当前用户无 docker 权限）"

# compose 默认拿目录名当项目名，很容易和机器上别的栈撞车 —— 撞上会直接 Recreate
# 人家的容器、还挂上同名数据卷。所以先确认这个项目名没被别的目录占着。
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$DIR")}"
owner=$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
        --format '{{.Label "com.docker.compose.project.working_dir"}}' | sort -u | head -1)
if [[ -n "$owner" && "$(realpath -m "$owner")" != "$(realpath -m "$DIR")" ]]; then
  die "机器上已有 compose 项目 '$PROJECT'（来自 $owner），与部署目录 $DIR 不是同一套。换个项目名重跑：COMPOSE_PROJECT_NAME=ragflow bash $0"
fi
export COMPOSE_PROJECT_NAME="$PROJECT"

# ── 1. 铺配置 ───────────────────────────────────
log "准备部署目录 $DIR（compose 项目名 $PROJECT）"
mkdir -p "$DIR"
for f in docker-compose.yml docker-compose-base.yml service_conf.yaml.template entrypoint.sh init.sql; do
  if [[ -f "$DIR/$f" ]] && ! cmp -s "$SRC/$f" "$DIR/$f"; then
    log "跳过 $f（目标已存在且内容不同，保留现场；要用新版先自行备份再删除）"
  else
    cp "$SRC/$f" "$DIR/$f"
  fi
done
chmod +x "$DIR/entrypoint.sh"

if [[ ! -f "$DIR/.env" ]]; then
  # 密码不写进仓库，首次部署随机生成
  cp "$SRC/env.example" "$DIR/.env"
  python3 - "$DIR/.env" <<'PYEOF'
import re, secrets, string, sys
alphabet = string.ascii_letters + string.digits
path = sys.argv[1]
text = re.sub(r'(?m)^([A-Z_]*PASSWORD)=CHANGE_ME$',
              lambda m: f"{m.group(1)}={''.join(secrets.choice(alphabet) for _ in range(24))}",
              open(path).read())
open(path, 'w').write(text)
PYEOF
  chmod 600 "$DIR/.env"
  log "已生成 $DIR/.env（各服务密码随机，妥善保存）"
else
  log "$DIR/.env 已存在，沿用"
  if grep -q '=CHANGE_ME$' "$DIR/.env"; then die "$DIR/.env 里还有 CHANGE_ME 占位，先填好再跑"; fi
fi

CRED="$DIR/.admin-credentials"
if [[ -z "$ADMIN_PASSWORD" && -f "$CRED" ]]; then
  ADMIN_PASSWORD=$(sed -n 's/^password=//p' "$CRED" | tail -1)
  log "沿用 $CRED 里的管理员密码"
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD=$(python3 -c "import secrets,string;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(24)))")
  (umask 077; printf 'email=%s\npassword=%s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" > "$CRED")
  log "已生成管理员密码，存在 $CRED（权限 600）"
fi

API_PORT=$(sed -n 's/^SVR_HTTP_PORT=//p' "$DIR/.env" | tail -1)
API="http://127.0.0.1:${API_PORT:-9380}"

# ── 2. 起容器 ───────────────────────────────────
cd "$DIR"
log "启动容器（首次会比较慢，ES 要预热）"
docker compose up -d

log "等待 RAGFlow 就绪（最多 10 分钟）"
ready=""
for _ in $(seq 1 120); do
  if [[ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$API/api/v1/system/healthz")" == 200 ]]; then
    ready=1; break
  fi
  sleep 5
done
[[ -n "$ready" ]] || { docker compose logs --tail 50 ragflow-cpu; die "RAGFlow 没在 10 分钟内就绪"; }
log "RAGFlow 已就绪：$API"

# ── 3. 管理员账号 ───────────────────────────────
# 密码要用 RAGFlow 的公钥加密后再传，容器里有现成的函数
CID=$(docker compose ps -q ragflow-cpu) || true
[[ -n "$CID" ]] || die "找不到 ragflow-cpu 容器"
ENC=$(docker exec -i "$CID" python -c \
  "import sys;sys.path.insert(0,'/ragflow');from api.utils.crypt import crypt;print(crypt(sys.stdin.read().strip()))" \
  <<<"$ADMIN_PASSWORD")
[[ -n "$ENC" ]] || die "密码加密失败"

TOKEN=""
reg=$(curl -sS -X POST "$API/api/v1/users" -H 'Content-Type: application/json' \
      -d "{\"nickname\":\"admin\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ENC\"}")
case "$(jget message <<<"$reg")" in
  *"already registered"*) log "管理员 $ADMIN_EMAIL 已存在，跳过注册" ;;
  *) [[ "$(jget code <<<"$reg")" == 0 ]] || die "注册失败：$(jget message <<<"$reg")"
     log "已注册管理员 $ADMIN_EMAIL" ;;
esac

log "登录取 token"
TOKEN=$(curl -sS -D - -o /dev/null -X POST "$API/api/v1/auth/login" \
        -H 'Content-Type: application/json' \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ENC\"}" \
        | tr -d '\r' | sed -n 's/^[Aa]uthorization: //p' | tail -1)
[[ -n "$TOKEN" ]] || die "登录失败拿不到 token。账号已存在但密码对不上的话，用 ADMIN_PASSWORD=<原密码> 重跑"

# ── 4. 配模型 ───────────────────────────────────
log "配置 $PROVIDER（$MODEL_BASE_URL）"
# 建实例时 RAGFlow 会真的调一次 chat 和 embedding，模型服务不通就没法往下走
curl -sS -m 10 -o /dev/null "$MODEL_BASE_URL/v1/models" \
  || die "连不上模型服务 $MODEL_BASE_URL。先确认 Xinference 在跑、chat 和 embedding 两个模型已加载"
providers=$(api GET /api/v1/providers)
if ! grep -q "\"$PROVIDER\"" <<<"$providers"; then
  api PUT /api/v1/providers "{\"provider_name\":\"$PROVIDER\"}" >/dev/null
  log "已添加 provider $PROVIDER"
fi

instances=$(api GET "/api/v1/providers/$PROVIDER/instances")
if ! grep -q "\"$INSTANCE\"" <<<"$instances"; then
  # 必须带 model_info：不带的话 RAGFlow 会去 base_url 自动探测模型列表，
  # Xinference 探测不到就直接失败。带了则跳过探测，改为逐个真实调用验证。
  api POST "/api/v1/providers/$PROVIDER/instances" "$(cat <<JSON
{"instance_name":"$INSTANCE","api_key":"x","base_url":"$MODEL_BASE_URL","region":"",
 "model_info":[{"model_type":["chat"],"model_name":"chat","max_tokens":$CHAT_MAX_TOKENS},
               {"model_type":["embedding"],"model_name":"embedding","max_tokens":$EMBED_MAX_TOKENS}]}
JSON
)" >/dev/null
  log "已添加实例 $INSTANCE"
fi

add_model() { # $1=模型名 $2=类型 $3=max_tokens
  local resp
  resp=$(curl -sS -X POST "$API/api/v1/providers/$PROVIDER/instances/$INSTANCE/models" \
         -H "Authorization: $TOKEN" -H 'Content-Type: application/json' \
         -d "{\"model_name\":\"$1\",\"model_type\":\"$2\",\"max_tokens\":$3}")
  case "$(jget message <<<"$resp")" in
    *"already exists"*) log "模型 $1@$PROVIDER 已登记（建实例时带 model_info 就一并登记了）" ;;
    *) [[ "$(jget code <<<"$resp")" == 0 ]] || die "添加模型 $1 失败：$(jget message <<<"$resp")"
       log "已添加模型 $1@$PROVIDER（$2）" ;;
  esac
  api PATCH /api/v1/models/default \
    "{\"model_provider\":\"$PROVIDER\",\"model_instance\":\"$INSTANCE\",\"model_name\":\"$1\",\"model_type\":\"$2\"}" >/dev/null
}
add_model chat chat "$CHAT_MAX_TOKENS"
add_model embedding embedding "$EMBED_MAX_TOKENS"

models=$(api GET /api/v1/models)
for m in chat embedding; do
  grep -q "\"$m\"" <<<"$models" || die "模型 $m 没出现在 /api/v1/models 里，配置没生效"
done
log "模型已登记：chat@$PROVIDER、embedding@$PROVIDER"

# ── 5. 给应用用的 API key ───────────────────────
tokens=$(api GET /api/v1/system/tokens)
KEY=$(jget data 0 token <<<"$tokens")
if [[ -z "$KEY" ]]; then
  created=$(api POST /api/v1/system/tokens '{}')
  KEY=$(jget data token <<<"$created")
fi
[[ -n "$KEY" ]] || die "拿不到 API key"

if [[ -f "$CRED" ]]; then PW_HINT="密码见 $CRED"; else PW_HINT="你指定的 ADMIN_PASSWORD"; fi

cat <<EOF

────────────────────────────────────────
RAGFlow v0.27.1 部署完成

  控制台   http://<本机IP>:$(sed -n 's/^SVR_WEB_HTTP_PORT=//p' "$DIR/.env" | tail -1)
  API      $API
  管理员   $ADMIN_EMAIL / $PW_HINT
  模型     chat@$PROVIDER、embedding@$PROVIDER  →  $MODEL_BASE_URL

接下来：
  1. 把这个 API key 填进应用的 .env：
       RAGFLOW_API_KEY=$KEY
       RAGFLOW_HOST=http://<本机IP>:${API_PORT:-9380}
  2. 账号建好后建议关掉注册：改 $DIR/.env 的 REGISTER_ENABLED=0，
     再 cd $DIR && docker compose up -d ragflow-cpu
────────────────────────────────────────
EOF
