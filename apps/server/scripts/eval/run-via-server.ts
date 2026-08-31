/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , no-console , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-assignment , eqeqeq */
// cspell:disable-file
//
// 评测脚本 v2：走 server proxy（模拟真实用户使用流程）。
// 链路：本脚本 → http://localhost:3001/api/auth + /api/assistant → server → RAGFlow
//
// 用法：
//   tsx scripts/eval/run-via-server.ts \
//     --server http://localhost:3001 \
//     --assistant <local-assistant-id> \
//     --dataset questions-0520.json \
//     --output <experiment-id>
//
// 环境（仅 LLM judge 需要，judge 还是直接打 RAGFlow，不走 server）：
//   RAGFLOW_HOST, RAGFLOW_API_KEY, RAGFLOW_JUDGE_ASSISTANT_ID

import type { FactItem, NotContainItem } from './scoring';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { averageScores, parseJudgeScore, runReplicas } from './judge';
import { cleanText, scoreAnswer } from './scoring';

interface CliArgs {
  assistant: number;
  dataset: string;
  noCache: boolean;
  output: string;
  password: string;
  server: string;
  username: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    server: 'http://localhost:3001',
    assistant: 0,
    dataset: '',
    output: '',
    username: 'admin',
    password: 'Admin@123',
    noCache: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--assistant': {
        args.assistant = Number.parseInt(v ?? '0', 10);
        i++;

        break;
      }
      case '--dataset': {
        args.dataset = v ?? '';
        i++;

        break;
      }
      case '--no-cache': {
        args.noCache = true;

        break;
      }
      case '--output': {
        args.output = v ?? '';
        i++;

        break;
      }
      case '--password': {
        args.password = v ?? args.password;
        i++;

        break;
      }
      case '--server': {
        args.server = v ?? args.server;
        i++;

        break;
      }
      case '--username': {
        args.username = v ?? args.username;
        i++;

        break;
      }
      // No default
    }
  }
  if (!args.assistant || !args.dataset || !args.output) {
    console.error(
      'Usage: tsx run-via-server.ts --assistant <id> --dataset <file> --output <experiment-id> [--server URL] [--username admin] [--password Admin@123]',
    );
    process.exit(1);
  }
  return args;
}

const RAGFLOW_HOST = process.env.RAGFLOW_HOST ?? '';
const RAGFLOW_KEY = process.env.RAGFLOW_API_KEY ?? '';
const RAGFLOW_PROD_BLACKLIST = (process.env.RAGFLOW_PROD_KEY_BLACKLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const JUDGE_ID = process.env.RAGFLOW_JUDGE_ASSISTANT_ID ?? '';
const JUDGE_REPLICAS = Math.max(
  1,
  Math.min(
    20,
    Number.parseInt(process.env.EVAL_JUDGE_REPLICAS ?? '3', 10) || 3,
  ),
);

if (RAGFLOW_KEY && RAGFLOW_PROD_BLACKLIST.includes(RAGFLOW_KEY)) {
  console.error(
    'Refusing to run with blacklisted (production) RAGFLOW_API_KEY',
  );
  process.exit(1);
}

interface QuestionRow {
  answer?: { raw?: string };
  id: number;
  llmJudgeRubric?: string;
  mustContain?: FactItem[];
  mustNotContain?: NotContainItem[];
  question: string;
  reference?: { doc?: string; section?: string };
  topic: string;
  useLLMJudge?: boolean;
}

async function signIn(
  server: string,
  username: string,
  password: string,
): Promise<string> {
  const r = await fetch(`${server}/api/auth/authentication/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = (await r.json()) as { accessToken?: string };
  if (!j.accessToken)
    throw new Error(`sign-in failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.accessToken;
}

async function createSession(
  server: string,
  jwt: string,
  assistant: number,
): Promise<string> {
  const r = await fetch(`${server}/api/assistant/${assistant}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: `eval-${Date.now()}` }),
  });
  const j = (await r.json()) as { data?: { id?: string }; id?: string };
  const sid = j.id ?? j.data?.id;
  if (!sid)
    throw new Error(`createSession failed: ${JSON.stringify(j).slice(0, 200)}`);
  return sid;
}

async function callCompletion(
  server: string,
  jwt: string,
  assistant: number,
  question: string,
  sessionId: string,
): Promise<{ answer: string; reference: any }> {
  const r = await fetch(`${server}/api/assistant/${assistant}/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, stream: false, sessionId }),
  });
  const j = (await r.json()) as { answer?: string; reference?: any };
  return { answer: j.answer ?? '', reference: j.reference ?? null };
}

async function callJudgeOnce(
  q: QuestionRow,
  modelAnswer: string,
  rubric: string,
): Promise<null | number> {
  const sessRes = await fetch(
    `${RAGFLOW_HOST}/api/v1/chats/${JUDGE_ID}/sessions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAGFLOW_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: `judge-q${q.id}-${Date.now()}` }),
    },
  );
  const sessJson = (await sessRes.json()) as { data?: { id: string } };
  const sid = sessJson.data?.id;
  if (!sid) throw new Error('judge session create failed');
  const prompt = [
    `问题：${q.question}`,
    '',
    `参考答案：`,
    q.answer?.raw ?? '',
    '',
    `评分标准：`,
    rubric,
    '',
    `模型回答：`,
    modelAnswer,
    '',
    `请只输出一个 0 到 1 之间的小数（保留 2 位）。不要任何文字解释、不要 markdown、不要单位。`,
  ].join('\n');
  const compRes = await fetch(
    `${RAGFLOW_HOST}/api/v1/chats/${JUDGE_ID}/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAGFLOW_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: prompt,
        stream: false,
        session_id: sid,
      }),
    },
  );
  const compJson = (await compRes.json()) as { data?: { answer?: string } };
  return parseJudgeScore(compJson.data?.answer ?? '');
}

interface QResult {
  answerText: string;
  durationMs: number;
  llmJudgeReplicas?: (null | number)[];
  llmJudgeScore?: null | number;
  mcScore?: null | number;
  mode: 'judge' | 'mc';
  qid: number;
  question: string;
  reference: any;
  topic: string;
}

async function processOne(
  q: QuestionRow,
  cfg: CliArgs,
  jwt: string,
  outDir: string,
): Promise<QResult> {
  const cachePath = resolve(outDir, `q${String(q.id).padStart(2, '0')}.json`);
  if (!cfg.noCache && existsSync(cachePath))
    return JSON.parse(readFileSync(cachePath, 'utf8'));

  const start = Date.now();
  const sid = await createSession(cfg.server, jwt, cfg.assistant);
  const { answer, reference } = await callCompletion(
    cfg.server,
    jwt,
    cfg.assistant,
    q.question,
    sid,
  );
  const cleaned = cleanText(answer);

  const result: QResult = {
    qid: q.id,
    topic: q.topic,
    question: q.question,
    answerText: cleaned,
    reference,
    mode: q.useLLMJudge ? 'judge' : 'mc',
    durationMs: 0,
  };

  if (q.useLLMJudge) {
    if (JUDGE_ID) {
      const reps = await runReplicas(JUDGE_REPLICAS, async (i) => {
        try {
          return await callJudgeOnce(q, cleaned, q.llmJudgeRubric ?? '');
        } catch (error) {
          console.warn(
            `Q${q.id}: judge ${i + 1}/${JUDGE_REPLICAS} failed: ${(error as Error).message}`,
          );
          throw error;
        }
      });
      result.llmJudgeReplicas = reps;
      result.llmJudgeScore = averageScores(reps);
    } else {
      result.llmJudgeScore = null;
      result.llmJudgeReplicas = [];
    }
  } else {
    result.mcScore = scoreAnswer(
      cleaned,
      q.mustContain ?? [],
      q.mustNotContain ?? [],
    ).finalScore;
  }

  result.durationMs = Date.now() - start;
  writeFileSync(cachePath, JSON.stringify(result, null, 2));
  return result;
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));
  console.log(`server: ${cfg.server}`);
  console.log(`assistant: ${cfg.assistant}`);
  console.log(`dataset: ${cfg.dataset}`);
  console.log(`output: ${cfg.output}`);

  const datasetPath = resolve(__dirname, 'dataset', cfg.dataset);
  const questions = (
    JSON.parse(readFileSync(datasetPath, 'utf8')) as {
      questions: QuestionRow[];
    }
  ).questions;
  console.log(`questions: ${questions.length}`);

  const outDir = resolve(__dirname, 'results', cfg.output);
  mkdirSync(outDir, { recursive: true });

  const jwt = await signIn(cfg.server, cfg.username, cfg.password);
  console.log(`jwt: ${jwt.slice(0, 40)}…\n`);

  const results: QResult[] = [];
  let done = 0;
  // 串行跑，避免冲掉同一 session id（每题独立 session 是没问题，但保留串行便于排查）
  for (const q of questions) {
    const t0 = Date.now();
    try {
      const r = await processOne(q, cfg, jwt, outDir);
      results.push(r);
      done++;
      const s = r.mcScore ?? r.llmJudgeScore;
      const tag = s == null ? 'null' : s.toFixed(2);
      console.log(
        `  ✓ Q${q.id} ${r.mode} ${tag} (${Date.now() - t0}ms)  [${done}/${questions.length}]`,
      );
    } catch (error) {
      console.error(`  ✗ Q${q.id} failed: ${(error as Error).message}`);
    }
  }

  // 汇总
  const valid = results
    .map((r) => r.mcScore ?? r.llmJudgeScore)
    .filter((s): s is number => s != null);
  const avg = valid.reduce((s, v) => s + v, 0) / Math.max(1, valid.length);
  const fullMatch = valid.filter((s) => s >= 0.999).length;
  const pending = results.filter(
    (r) => (r.mcScore ?? r.llmJudgeScore) == null,
  ).length;

  const customer = (() => {
    let pts = 0;
    let f = 0;
    let h = 0;
    let z = 0;
    for (const s of valid) {
      if (s >= 0.7) {
        pts++;
        f++;
      } else if (s >= 0.3) {
        pts += 0.5;
        h++;
      } else {
        z++;
      }
    }
    return { pts, f, h, z, ratio: pts / valid.length };
  })();
  const compet = valid.filter((s) => s >= 0.7).length / valid.length;

  const summary = [
    `# ${cfg.output}`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Server: ${cfg.server}  Assistant: ${cfg.assistant}  Dataset: ${cfg.dataset}`,
    ``,
    `## Aggregate`,
    `- N = ${results.length}  (judged ${valid.length}, pending ${pending})`,
    `- answer-final-avg = ${(avg * 100).toFixed(1)}%`,
    `- full-match (=1.0) = ${fullMatch}/${valid.length}`,
    `- 客户口径 (1/.5/0) = ${(customer.ratio * 100).toFixed(1)}%  (优${customer.f} + 良${customer.h} + 差${customer.z}; pts=${customer.pts.toFixed(1)})`,
    `- 竞品口径 (≥0.7对) = ${(compet * 100).toFixed(1)}%`,
    ``,
    `## Per-question`,
    `| ID | Topic | mode | answer |`,
    `|----|-------|------|--------|`,
    ...results.map((r) => {
      const s = r.mcScore ?? r.llmJudgeScore;
      return `| ${r.qid} | ${r.topic} | ${r.mode} | ${s == null ? 'pending' : s.toFixed(2)} |`;
    }),
  ].join('\n');
  writeFileSync(resolve(outDir, 'summary.md'), summary);
  console.log(`\n${summary.split('\n').slice(4, 12).join('\n')}`);
  console.log(`\nResults: ${outDir}`);
}

main().catch((error: unknown) => {
  console.error('FATAL:', (error as Error).message);
  process.exit(1);
});
