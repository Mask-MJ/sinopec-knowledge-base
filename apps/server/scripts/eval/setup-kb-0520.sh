#!/usr/bin/env bash
# 第二批 (0520) 评测 KB 一键搭建入口：
#   1. pandoc 预处理：test-docs/0520/*.docx → /tmp/0520-prepared/*.md（与 prod docx-preprocess 一致）
#   2. cp pdf 原文件到 prepared 目录
#   3. 调用 setup-kb-0520.ts 走 RAGFlow API 建库 + 上传 + 触发解析 + 轮询
#
# 用法：
#   apps/server/scripts/eval/setup-kb-0520.sh
#
# 可选环境变量：
#   ENV_FILE        dotenvx 加载的 env 文件路径（默认 .env.eval）
#   PREPARED_DIR    覆盖中间目录（默认 /tmp/0520-prepared）
#   KB_NAME         覆盖新库名（默认 eval-0520-<ts>）
#   SRC_DATASET     借用其 embedding/chunk 配置的源 dataset id（默认 prod-v2）
#   ASSISTANT_ID    评测沿用的 assistant id（默认 prod-v2 assistant）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
SRC_DOCS="$ROOT/test-docs/0520"
PREPARED_DIR="${PREPARED_DIR:-/tmp/0520-prepared}"
KB_NAME="${KB_NAME:-eval-0520-$(date +%Y%m%d-%H%M)}"
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
echo ">> Calling setup-kb-0520.ts (build dataset + upload + parse)"
cd "$ROOT/apps/server"
pnpm exec dotenvx run --env-file="$ENV_FILE" -- tsx scripts/eval/setup-kb-0520.ts \
  --source-dir "$PREPARED_DIR" \
  --kb-name "$KB_NAME" \
  --src-dataset "$SRC_DATASET" \
  --assistant "$ASSISTANT_ID"
