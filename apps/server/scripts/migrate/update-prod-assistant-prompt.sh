#!/usr/bin/env bash
# cspell:ignore RAGFlow disambiguation refine multiturn topn topk dotenvx pyyaml rstrip isinstance tofile rerank
#
# update-prod-assistant-prompt.sh —— 把 q14-disambiguation-prompt.md 追加到 prod
# RAGFlow assistant 的 system prompt 末尾（GET → merge → PUT）。
#
# !!! 这是 ops 操作，会改变 prod 用户的 chat 行为 !!!
# 必须由运维评审 + 产品 owner 确认后再跑 --apply。脚本默认 dry-run。
#
# 用法:
#   # 1) dry-run (默认)：仅 GET prod 当前 prompt + 打印 + 显示 unified diff
#   RAGFLOW_HOST=http://ragflow:9380 \
#   RAGFLOW_API_KEY=ragflow-xxx \
#   ./apps/server/scripts/migrate/update-prod-assistant-prompt.sh
#
#   # 2) 真正落库：加 --apply
#   RAGFLOW_HOST=http://ragflow:9380 \
#   RAGFLOW_API_KEY=ragflow-xxx \
#   ./apps/server/scripts/migrate/update-prod-assistant-prompt.sh --apply
#
#   # 3) 改 assistant id（默认 b7e94c58476611f1a9b8932ed31a3307）
#   TARGET_ASSISTANT_ID=<id> ./apps/server/scripts/migrate/update-prod-assistant-prompt.sh
#
# 行为:
#   - GET /api/v1/chats?id=<id> 拿现有 assistant 全量配置
#   - 把 q14-disambiguation-prompt.md 中分隔线 (---) 之后的正文当作追加文本
#   - 备份原 prompt 到 /tmp/prod-assistant-prompt-backup-<timestamp>.txt
#   - 显示 unified diff
#   - --apply 时按 run.ts syncAssistantConfig 的字段映射做 merge 后 PUT
#     （prompt.prompt → prompt_config.system，其它字段全部从 GET 原样回 PUT）
#
# 依赖: bash, python3 (>= 3.8)，stdlib 即可，不需要 requests / pyyaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/q14-disambiguation-prompt.md"

if [[ ! -f "${PROMPT_FILE}" ]]; then
  echo "ERROR: prompt file not found: ${PROMPT_FILE}" >&2
  exit 1
fi

APPLY=0
for arg in "$@"; do
  case "${arg}" in
    --apply) APPLY=1 ;;
    -h | --help)
      sed -n '2,30p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: ${arg}" >&2
      exit 2
      ;;
  esac
done

: "${RAGFLOW_HOST:?ERROR: RAGFLOW_HOST env var is required (e.g. http://ragflow:9380)}"
: "${RAGFLOW_API_KEY:?ERROR: RAGFLOW_API_KEY env var is required}"
TARGET_ASSISTANT_ID="${TARGET_ASSISTANT_ID:-b7e94c58476611f1a9b8932ed31a3307}"

export RAGFLOW_HOST RAGFLOW_API_KEY TARGET_ASSISTANT_ID PROMPT_FILE APPLY

python3 - <<'PY'
import difflib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HOST = os.environ["RAGFLOW_HOST"].rstrip("/")
API_KEY = os.environ["RAGFLOW_API_KEY"]
ASSISTANT_ID = os.environ["TARGET_ASSISTANT_ID"]
PROMPT_FILE = Path(os.environ["PROMPT_FILE"])
APPLY = os.environ.get("APPLY", "0") == "1"


def api(method: str, path: str, body=None):
    url = f"{HOST}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        print(f"ERROR: {method} {path} -> HTTP {e.code}", file=sys.stderr)
        print(body_text, file=sys.stderr)
        sys.exit(3)
    except urllib.error.URLError as e:
        print(f"ERROR: {method} {path} -> {e.reason}", file=sys.stderr)
        print(
            "(check RAGFLOW_HOST is reachable from this shell — ssh tunnel etc.)",
            file=sys.stderr,
        )
        sys.exit(3)
    if not isinstance(payload, dict):
        print(f"ERROR: unexpected response shape: {type(payload)}", file=sys.stderr)
        sys.exit(3)
    if payload.get("code") not in (0, None):
        print(
            f"ERROR: RAGFlow returned code={payload.get('code')} message={payload.get('message')}",
            file=sys.stderr,
        )
        sys.exit(3)
    return payload.get("data")


def extract_appendix(md_text: str) -> str:
    """Take everything after the first standalone '---' separator line as the body to append.

    The frontmatter / explanation block (above the first '---') is for human readers
    of the markdown file; only the section after the separator goes to the LLM.
    """
    lines = md_text.splitlines()
    sep_idx = None
    for i, ln in enumerate(lines):
        if ln.strip() == "---" and i > 0:
            sep_idx = i
            break
    if sep_idx is None:
        print(
            "ERROR: prompt file must contain a '---' separator; everything after it is appended.",
            file=sys.stderr,
        )
        sys.exit(4)
    body = "\n".join(lines[sep_idx + 1 :]).strip()
    if not body:
        print("ERROR: appendix body is empty", file=sys.stderr)
        sys.exit(4)
    return body


# ---------- 1. read appendix ----------
appendix = extract_appendix(PROMPT_FILE.read_text(encoding="utf-8"))

# ---------- 2. fetch current assistant ----------
print(f"GET  {HOST}/api/v1/chats?id={ASSISTANT_ID}", file=sys.stderr)
chats = api("GET", f"/api/v1/chats?id={ASSISTANT_ID}")
if not chats:
    print(f"ERROR: assistant {ASSISTANT_ID} not found", file=sys.stderr)
    sys.exit(5)
cur = chats[0]
cur_prompt_obj = cur.get("prompt") or {}
cur_llm_obj = cur.get("llm") or {}
old_system = cur_prompt_obj.get("prompt") or ""

# ---------- 3. backup ----------
ts = time.strftime("%Y%m%d-%H%M%S")
backup_path = Path(f"/tmp/prod-assistant-prompt-backup-{ts}.txt")
backup_path.write_text(old_system, encoding="utf-8")
print(f"backup written: {backup_path} (len={len(old_system)})", file=sys.stderr)

# ---------- 4. compose new prompt ----------
joiner = "\n\n" if old_system and not old_system.endswith("\n\n") else ""
new_system = f"{old_system}{joiner}{appendix}\n"

# ---------- 5. show diff ----------
diff = difflib.unified_diff(
    old_system.splitlines(keepends=True),
    new_system.splitlines(keepends=True),
    fromfile="prod assistant prompt (current)",
    tofile="prod assistant prompt (proposed)",
    n=3,
)
print("\n----- unified diff -----", file=sys.stderr)
sys.stderr.writelines(diff)
print("\n----- end diff -----\n", file=sys.stderr)
print(
    f"old length = {len(old_system)} chars / new length = {len(new_system)} chars / +{len(new_system) - len(old_system)}",
    file=sys.stderr,
)

if not APPLY:
    print("\n[dry-run] not applying. pass --apply to PUT prod assistant.", file=sys.stderr)
    sys.exit(0)

# ---------- 6. apply (PUT) ----------
# Mirrors apps/server/scripts/eval/run.ts :: syncAssistantConfig
# RAGFlow PUT 是全量替换，遗漏的字段会回到默认值；所有字段必须从 GET 原样取回。
body = {
    "name": cur.get("name") or "assistant",
    "dataset_ids": cur.get("dataset_ids") or [],
    "llm_id": cur_llm_obj.get("model_name") or "deepseek-chat@DeepSeek",
    "llm_setting": {
        "temperature": cur_llm_obj.get("temperature", 0.1),
        "top_p": cur_llm_obj.get("top_p", 0.3),
        "presence_penalty": cur_llm_obj.get("presence_penalty", 0.4),
        "frequency_penalty": cur_llm_obj.get("frequency_penalty", 0.7),
        "max_tokens": cur_llm_obj.get("max_tokens", 512),
    },
    "similarity_threshold": cur.get("similarity_threshold", 0.2),
    "vector_similarity_weight": cur.get("vector_similarity_weight", 0.3),
    "top_k": cur.get("top_k", 1024),
    "top_n": cur.get("top_n", 6),
    # RAGFlow GET returns prompt.prompt; PUT accepts prompt_config.system —— 必须做映射
    "prompt_config": {
        "system": new_system,
        "parameters": cur_prompt_obj.get("variables") or [
            {"key": "knowledge", "optional": False}
        ],
        "empty_response": cur_prompt_obj.get("empty_response", ""),
        "opener": cur_prompt_obj.get("opener", ""),
        "quote": cur_prompt_obj.get("show_quote", True),
        "refine_multiturn": cur_prompt_obj.get("refine_multiturn", True),
    },
}
if cur.get("rerank_id"):
    body["rerank_id"] = cur["rerank_id"]

print(f"PUT  {HOST}/api/v1/chats/{ASSISTANT_ID}", file=sys.stderr)
api("PUT", f"/api/v1/chats/{ASSISTANT_ID}", body)
print("OK: prod assistant prompt updated.", file=sys.stderr)
print(f"backup retained at: {backup_path}", file=sys.stderr)
PY
