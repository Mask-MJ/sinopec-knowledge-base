#!/usr/bin/env python3
"""Compare ES chunks between two RAGFlow KBs (naive vs manual parser).

Usage: compare-naive-manual.py <prod_kb_id> <manual_kb_id>

For each (doc_filename_substr, pattern, why) tuple defined below, count
matches in both KBs and emit a markdown table summarising whether the
manual parser preserved content the naive parser dropped (or vice versa).

The script shells out to `ssh ragflow` + `docker exec docker-es01-1 curl`,
so it expects:
  - an ssh alias `ragflow` reachable from the runner
  - the elasticsearch container `docker-es01-1` running there
  - a single `ragflow_*` index — adjust INDEX below if you reset/migrate.
"""
import json
import re
import subprocess
import sys

INDEX = "ragflow_7693ddb6475e11f1b8a2a9e89f4d8bb7"

# (doc_filename_substr, pattern, why_it_matters)
CASES = [
    # Q18: observation-system code that the naive parser dropped
    ("页岩气", "20L32S378P168F", "Q18: full observation-system code"),
    ("页岩气", "32S378P168F", "Q18: observation code without leading 20L"),
    ("页岩气", "7560道", "Q18: receiver-channel count"),
    ("页岩气", "320m", "Q18: receiver-line spacing"),
    ("页岩气", "40m", "Q18: trace spacing"),
    # Q19: surface-structure ranges the naive parser truncated
    ("页岩气", "0-4m", "Q19: low-velocity layer thickness range"),
    ("页岩气", "395-1000", "Q19: low-velocity layer speed range"),
    ("页岩气", "1200-3000", "Q19: degraded layer speed range"),
    ("页岩气", "3400-5700", "Q19: high-velocity layer speed range"),
    ("页岩气", "395~1000", "Q19: speed range with full-width tilde"),
    # Q6: heading "一升一降三确保" + the 5 sub-policies
    ("工程设计", "一升一降三确保", "Q6: heading slogan"),
    ("工程设计", "优化观测系统设计", "Q6: 一升 = optimise observation system"),
    ("工程设计", "降低噪音干扰", "Q6: 一降 = noise reduction"),
    ("工程设计", "保证点位精度", "Q6: 三确保 #1"),
    ("工程设计", "确保激发效果", "Q6: 三确保 #2"),
    ("工程设计", "确保接收效果", "Q6: 三确保 #3"),
    # baseline: trial report — should be intact in both parsers
    ("试验报告", "36线×6炮×528道", "control: observation params"),
    ("试验报告", "12.5m×25m", "control: bin size"),
]


def es_password() -> str:
    out = subprocess.check_output(
        [
            "ssh",
            "ragflow",
            "docker inspect docker-es01-1 -f '{{range .Config.Env}}{{println .}}{{end}}'",
        ],
        text=True,
    )
    return next(
        line.split("=", 1)[1]
        for line in out.splitlines()
        if line.startswith("ELASTIC_PASSWORD=")
    )


def es_query(pwd: str, body: dict) -> dict:
    cmd = (
        f"docker exec -i docker-es01-1 curl -s -u 'elastic:{pwd}' "
        f"http://localhost:9200/{INDEX}/_search "
        f"-H 'Content-Type: application/json' -d '{json.dumps(body)}'"
    )
    out = subprocess.check_output(["ssh", "ragflow", cmd], text=True)
    return json.loads(out)


def count_chunks(
    pwd: str, kb_id: str, doc_substr: str, pattern: str
) -> tuple[int, int, str | None]:
    """Return (chunks_with_pattern, total_chunks_in_doc, sample_excerpt)."""
    body = {
        "size": 1000,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"kb_id": kb_id}},
                    {"wildcard": {"docnm_kwd": f"*{doc_substr}*"}},
                ]
            }
        },
        "_source": ["content_with_weight"],
    }
    r = es_query(pwd, body)
    hits = r.get("hits", {}).get("hits", [])
    total = len(hits)
    rx = re.compile(re.escape(pattern))
    sample: str | None = None
    matched = 0
    for h in hits:
        cw = h.get("_source", {}).get("content_with_weight", "")
        if rx.search(cw):
            matched += 1
            if sample is None:
                idx = cw.find(pattern)
                start = max(0, idx - 60)
                end = min(len(cw), idx + len(pattern) + 100)
                sample = cw[start:end].replace("\n", " ").strip()
    return matched, total, sample


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: compare-naive-manual.py <prod_kb_id> <manual_kb_id>")
    prod_kb, manual_kb = sys.argv[1], sys.argv[2]
    pwd = es_password()
    print(
        f"# naive (kb={prod_kb}) vs manual (kb={manual_kb}) — chunk comparison\n"
    )
    print("| doc | pattern | naive hits / total | manual hits / total | meaning |")
    print("|---|---|---|---|---|")
    rows: list[tuple] = []
    for doc, pat, why in CASES:
        p_hit, p_tot, p_ex = count_chunks(pwd, prod_kb, doc, pat)
        m_hit, m_tot, m_ex = count_chunks(pwd, manual_kb, doc, pat)
        if p_hit == 0 and m_hit > 0:
            delta = "✅ FIXED"
        elif p_hit == 0 and m_hit == 0:
            delta = "❌ STILL MISSING"
        elif p_hit > 0 and m_hit > 0:
            delta = "🔄 BOTH HAVE"
        else:
            delta = "⬇️ REGRESSED"
        rows.append((doc, pat, p_hit, p_tot, m_hit, m_tot, delta, why, p_ex, m_ex))
        print(
            f"| {doc} | `{pat}` | {p_hit}/{p_tot} | {m_hit}/{m_tot} | {why} → {delta} |"
        )
    print()
    print("## Sample excerpts (first match in each KB)")
    for doc, pat, _ph, _pt, _mh, _mt, delta, _why, p_ex, m_ex in rows:
        print(f"\n### `{pat}` in {doc} — {delta}")
        if p_ex:
            print(f"- naive: …{p_ex}…")
        if m_ex:
            print(f"- manual: …{m_ex}…")


if __name__ == "__main__":
    main()
