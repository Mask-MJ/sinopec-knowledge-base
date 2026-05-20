/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , no-console , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-member-access , @typescript-eslint/no-unsafe-argument , @typescript-eslint/no-unsafe-assignment , @typescript-eslint/restrict-plus-operands , eqeqeq */
// cspell:disable-file
// 不重跑 chat，仅用当前 scoring 逻辑对已有 results 重新打分。用于验证 scoring bug fix 的影响。
//
// 用法：
//   tsx scripts/eval/_rescore.ts --results 0520-baseline [--dataset questions-0520.json]

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanText, scoreAnswer } from './scoring';

function parseArgs(argv: string[]) {
  let results = '';
  let dataset = 'questions-0520.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--results') results = argv[++i] ?? '';
    else if (argv[i] === '--dataset') dataset = argv[++i] ?? dataset;
  }
  if (!results) {
    console.error('Usage: tsx _rescore.ts --results <name> [--dataset <file>]');
    process.exit(1);
  }
  return { results, dataset };
}

const { results, dataset } = parseArgs(process.argv.slice(2));
const resultsDir = resolve(__dirname, 'results', results);
const datasetPath = resolve(__dirname, 'dataset', dataset);
const qset: { questions: any[] } = JSON.parse(
  readFileSync(datasetPath, 'utf8'),
);
const qById = new Map<number, any>(qset.questions.map((q) => [q.id, q]));

interface Row {
  delta: number;
  hits: string;
  judge: boolean;
  newScore: null | number;
  oldScore: null | number;
  qid: number;
}

const rows: Row[] = [];
let oldTotal = 0;
let newTotal = 0;
let count = 0;
const files = readdirSync(resultsDir)
  .filter((f) => /^q\d+\.json$/.test(f))
  .sort();

for (const f of files) {
  const r: any = JSON.parse(readFileSync(resolve(resultsDir, f), 'utf8'));
  const qid: number = r.qid;
  const q = qById.get(qid);
  if (!q) continue;
  const judge: boolean = !!q.useLLMJudge;
  // LLM-judge 题不用 mustContain 算分，跳过重算（保留原 llmJudgeScore）
  if (judge) {
    const old = r.llmJudgeScore;
    if (old != null) {
      oldTotal += old;
      newTotal += old;
      count++;
    }
    rows.push({
      qid,
      oldScore: old,
      newScore: old,
      delta: 0,
      judge: true,
      hits: '-',
    });
    continue;
  }
  const old = r.answerScore?.finalScore ?? null;
  const fresh = scoreAnswer(
    cleanText(r.answerText ?? ''),
    q.mustContain ?? [],
    q.mustNotContain ?? [],
  );
  const newScore = fresh.finalScore;
  const hits = `${fresh.mustContainHitWeight}/${fresh.mustContainTotalWeight}`;
  if (old != null) oldTotal += old;
  newTotal += newScore;
  count++;
  rows.push({
    qid,
    oldScore: old,
    newScore,
    delta: newScore - (old ?? 0),
    judge: false,
    hits,
  });
}

rows.sort((a, b) => a.qid - b.qid);
console.log(
  `${'Q'.padStart(3)}  ${'old'.padStart(6)}  ${'new'.padStart(6)}  ${'Δ'.padStart(7)}  hits  mode`,
);
for (const r of rows) {
  let flag = '';
  if (Math.abs(r.delta) >= 0.001) flag = r.delta > 0 ? ' ↑' : ' ↓';
  console.log(
    `${String(r.qid).padStart(3)}  ${(r.oldScore ?? 0).toFixed(2).padStart(6)}  ${(r.newScore ?? 0).toFixed(2).padStart(6)}  ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2).padStart(6)}  ${r.hits.padStart(4)}  ${r.judge ? 'judge' : 'mc'}${flag}`,
  );
}
console.log();
console.log(
  `over ${count} scored: old-avg=${((oldTotal / count) * 100).toFixed(1)}% → new-avg=${((newTotal / count) * 100).toFixed(1)}% (Δ ${(((newTotal - oldTotal) / count) * 100).toFixed(2)}%)`,
);
