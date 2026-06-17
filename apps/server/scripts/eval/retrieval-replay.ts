/* eslint-disable no-console, no-lone-blocks, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/use-unknown-in-catch-callback-variable, unicorn/no-process-exit, unicorn/prefer-module, turbo/no-undeclared-env-vars */
import type {
  ReplayChunk,
  ReplayRetrievalParams,
} from './retrieval-replay.lib';
import type { QuestionRef } from './scoring';

// cspell:disable-file
/**
 * 检索回放(只读 dump)：对指定题目拉 top-k chunk 完整证据，渲染成 markdown。
 * 用法: dotenvx run --env-file=.env.eval -- tsx scripts/eval/retrieval-replay.ts \
 *         --config <path> [--ids 6,14,18] [--k 30]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pLimit from 'p-limit';

import {
  buildReplayBody,
  mapChunk,
  parseIdList,
  renderQuestionSection,
  renderReport,
} from './retrieval-replay.lib';

interface ExperimentConfig {
  dataset?: string;
  datasetIds: string[];
  experimentId: string;
  retrieval: ReplayRetrievalParams;
  split?: 'all' | 'dev' | 'holdout';
}

interface QuestionRow {
  id: number;
  question: string;
  reference: QuestionRef;
  topic: string;
}

interface QuestionSet {
  questions: QuestionRow[];
  splits: { dev: number[]; holdout: number[] };
}

const HOST = process.env.RAGFLOW_HOST ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';
const PROD_BLACKLIST = new Set(
  (process.env.RAGFLOW_PROD_KEY_BLACKLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(HOST + path, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok)
    throw new Error(
      `${method} ${path} HTTP ${r.status}: ${text.slice(0, 200)}`,
    );
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} non-JSON: ${text.slice(0, 200)}`);
  }
  if (j.code !== 0)
    throw new Error(`${method} ${path} code=${j.code}: ${j.message ?? ''}`);
  return j.data as T;
}

function parseArgs(argv: string[]) {
  let configPath = '';
  let ids: number[] | undefined;
  let k = 30;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--config': {
        configPath = argv[++i] ?? '';
        break;
      }
      case '--ids': {
        ids = parseIdList(argv[++i] ?? '');
        break;
      }
      case '--k': {
        {
          k = Number.parseInt(argv[++i] ?? '30', 10);
          // No default
        }
        break;
      }
    }
  }
  if (!configPath) {
    console.error(
      'Usage: tsx retrieval-replay.ts --config <path> [--ids 6,14,18] [--k 30]',
    );
    process.exit(1);
  }
  return { configPath, ids, k };
}

async function callRetrievalFull(
  question: string,
  cfg: ExperimentConfig,
  k: number,
): Promise<ReplayChunk[]> {
  const body = buildReplayBody(question, cfg.datasetIds, cfg.retrieval, k);
  const data = await api<{ chunks?: any[] }>('POST', '/api/v1/retrieval', body);
  return (data.chunks ?? []).map((c, i) => mapChunk(c, i));
}

async function main(): Promise<void> {
  if (!HOST || !API_KEY) {
    console.error('RAGFLOW_HOST / RAGFLOW_API_KEY required');
    process.exit(1);
  }
  if (PROD_BLACKLIST.has(API_KEY)) {
    console.error('Refusing to run with blacklisted (production) API key');
    process.exit(1);
  }

  const { configPath, ids, k } = parseArgs(process.argv.slice(2));
  const cfg: ExperimentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const datasetFile = cfg.dataset ?? 'questions.json';
  const set: QuestionSet = JSON.parse(
    readFileSync(resolve(__dirname, 'dataset', datasetFile), 'utf8'),
  );

  const split = cfg.split ?? 'all';
  const selectedIds =
    ids ??
    (split === 'all' ? set.questions.map((q) => q.id) : set.splits[split]);

  const known = new Set(set.questions.map((q) => q.id));
  const missing = selectedIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    console.error(
      `Unknown question ids in ${datasetFile}: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
  const questions = set.questions.filter((q) => selectedIds.includes(q.id));

  const outputDir = resolve(__dirname, 'results', `${cfg.experimentId}-replay`);
  mkdirSync(outputDir, { recursive: true });

  console.log(
    `\nReplay: ${cfg.experimentId}  dataset=${datasetFile}  ids=${selectedIds.join(',')}  k=${k}`,
  );
  console.log(`Host: ...${HOST.slice(-25)}  Key: ...${API_KEY.slice(-4)}\n`);

  const topN = cfg.retrieval.topN ?? 10;
  const limit = pLimit(3);
  const sections = await Promise.all(
    questions.map((q) =>
      limit(async () => {
        try {
          const chunks = await callRetrievalFull(q.question, cfg, k);
          console.log(`  ✓ Q${q.id} chunks=${chunks.length}`);
          return renderQuestionSection({
            qid: q.id,
            topic: q.topic,
            question: q.question,
            reference: q.reference,
            chunks,
            topN,
          });
        } catch (error) {
          console.error(`  ✗ Q${q.id} ERROR:`, (error as Error).message);
          return renderQuestionSection({
            qid: q.id,
            topic: q.topic,
            question: q.question,
            reference: q.reference,
            chunks: [],
            topN,
            error: (error as Error).message,
          });
        }
      }),
    ),
  );

  const report = renderReport(
    {
      experimentId: cfg.experimentId,
      generatedAt: new Date().toISOString(),
      retrieval: cfg.retrieval,
      ids: selectedIds,
      k,
    },
    sections,
  );
  const outPath = resolve(outputDir, 'replay.md');
  writeFileSync(outPath, report);
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
