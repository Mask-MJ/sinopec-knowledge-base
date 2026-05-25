#!/usr/bin/env bash
# 0520 评测的 Qwen3-Embedding (DashScope text-embedding-v4) 对照库一键搭建：
#   完全复用 setup-kb-0520.sh 的 docx → md 预处理 + RAGFlow 建库流程，
#   只是把 embedding_model 从源 dataset 的默认值 override 成 text-embedding-v4。
#
# 前置条件：
#   - RAGFlow Tenant Model Settings 里已挂上 Tongyi-Qianwen provider，
#     且 GET /v1/llm/list 返回的 Tongyi-Qianwen 组里 text-embedding-v4 available=true
#     （内部接口，按 provider 分组返回；不是 /api/v1/llms）。
#   - 本机能访问 RAGFlow（.env.eval 配好 RAGFLOW_HOST / RAGFLOW_API_KEY）。
#     注意：远程评测实例在 ragflow:9380（Tailscale），本机 docker 在 :59380，
#     别串库串 key——参考 docs/superpowers/plans/2026-05-20-qwen3-embedding-v4-eval.md。
#
# 用法：
#   apps/server/scripts/eval/setup-kb-0520-qwen3.sh
#
# 可选环境变量（覆盖默认）：
#   EMBEDDING_MODEL  RAGFlow 里 embedding 模型注册名（默认 text-embedding-v4@Tongyi-Qianwen）
#   EXPERIMENT_ID    实验 ID，决定写出的 configs/<id>.json（默认 0520-qwen3-embedding-v4）
#   KB_NAME          新库名（默认 eval-0520-qwen3-<ts>）
#   PREPARED_DIR     pandoc 中间产物目录（默认 /tmp/0520-prepared）
#   SRC_DATASET      借用 chunk_method 的源 dataset id（默认 prod-v2）
#   ASSISTANT_ID     评测沿用的 assistant id（默认 prod-v2 assistant）
#   ENV_FILE         dotenvx 加载的 env 文件（默认 .env.eval）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
SRC_DOCS="$ROOT/test-docs/0520"
PREPARED_DIR="${PREPARED_DIR:-/tmp/0520-prepared}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-text-embedding-v4@Tongyi-Qianwen}"
EXPERIMENT_ID="${EXPERIMENT_ID:-0520-qwen3-embedding-v4}"
KB_NAME="${KB_NAME:-eval-0520-qwen3-$(date +%Y%m%d-%H%M)}"
SRC_DATASET="${SRC_DATASET:-6ec4cd18476611f1a9b8932ed31a3307}"
ASSISTANT_ID="${ASSISTANT_ID:-b7e94c58476611f1a9b8932ed31a3307}"
ENV_FILE="${ENV_FILE:-.env.eval}"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "ERROR: pandoc not found in PATH (required for docx → md preprocess)" >&2
  exit 1
fi

mkdir -p "$PREPARED_DIR"
# 清理上次运行残留，避免老 md 混入
find "$PREPARED_DIR" -maxdepth 1 -type f \( -name '*.md' -o -name '*.pdf' \) -delete

echo ">> Preprocessing 0520 docs into $PREPARED_DIR"
shopt -s nullglob
for src in "$SRC_DOCS"/*.docx "$SRC_DOCS"/*.pdf; do
  base="$(basename "$src")"
  # 跳过题目本身——只上传业务文档
  if [[ "$base" == RAG问题和参考答案* ]]; then
    echo "  - skip (question file): $base"
    continue
  fi
  if [[ "$base" == *.docx ]]; then
    out="$PREPARED_DIR/${base%.docx}.md"
    pandoc -f docx -t gfm "$src" -o "$out"
    echo "  - docx→md: $base ($(wc -c <"$out") bytes)"
  else
    out="$PREPARED_DIR/$base"
    cp "$src" "$out"
    echo "  - pdf  : $base ($(stat -c %s "$out") bytes)"
  fi
done

echo
echo ">> Calling setup-kb-0520.ts with embedding=$EMBEDDING_MODEL"
cd "$ROOT/apps/server"
pnpm exec dotenvx run --env-file="$ENV_FILE" -- tsx scripts/eval/setup-kb-0520.ts \
  --source-dir "$PREPARED_DIR" \
  --kb-name "$KB_NAME" \
  --src-dataset "$SRC_DATASET" \
  --assistant "$ASSISTANT_ID" \
  --embedding-model "$EMBEDDING_MODEL" \
  --experiment-id "$EXPERIMENT_ID"
