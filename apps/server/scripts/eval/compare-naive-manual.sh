#!/usr/bin/env bash
# Compare ES chunk content between the prod naive-parser KB and a
# fresh manual-parser KB created by the kb-manual-comparison E2E spec.
#
# Reads:
#   apps/client/test-results/kb-manual-comparison.json (E2E summary)
# Required env:
#   COMPARE_PROD_KB     — prod naive KB datasetId (the dataset under test)
# Optional positional override:
#   $1 wins over COMPARE_PROD_KB.
#
# Usage:
#   COMPARE_PROD_KB=<prod-kb-id> \
#     apps/server/scripts/eval/compare-naive-manual.sh
#   apps/server/scripts/eval/compare-naive-manual.sh <prod-kb-id>
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
SUMMARY="$ROOT/apps/client/test-results/kb-manual-comparison.json"
PROD_KB="${1:-${COMPARE_PROD_KB:-}}"

if [[ -z "$PROD_KB" ]]; then
  echo "PROD_KB id required: pass as \$1 or set COMPARE_PROD_KB" >&2
  exit 1
fi

if [[ ! -f "$SUMMARY" ]]; then
  echo "summary file not found: $SUMMARY" >&2
  echo "run the kb-manual-comparison E2E spec first" >&2
  exit 1
fi

MANUAL_KB="$(python3 -c "import json,sys;print(json.load(open('$SUMMARY')).get('datasetId',''))")"
if [[ -z "$MANUAL_KB" ]]; then
  echo "datasetId missing in $SUMMARY" >&2
  exit 1
fi

echo "prod (naive)  kb_id = $PROD_KB"
echo "manual         kb_id = $MANUAL_KB"
echo

python3 "$HERE/compare-naive-manual.py" "$PROD_KB" "$MANUAL_KB"
