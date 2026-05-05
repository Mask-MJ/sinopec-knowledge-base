/* eslint-disable unicorn/prefer-module , unicorn/prefer-string-slice , unicorn/no-nested-ternary , unicorn/no-zero-fractions , unicorn/no-process-exit , unicorn/prefer-single-call , no-cond-assign , no-console , no-unused-vars , no-lone-blocks , eqeqeq , @typescript-eslint/no-unnecessary-condition , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-member-access , @typescript-eslint/no-unsafe-argument , @typescript-eslint/no-unsafe-return , @typescript-eslint/restrict-template-expressions , @typescript-eslint/use-unknown-in-catch-callback-variable , regexp/no-dupe-disjunctions , regexp/no-obscure-range , regexp/no-unused-capturing-group , regexp/no-misleading-capturing-group */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import type { AnswerScore, ChunkRef, RetrievalScore } from './scoring';

/**
 * RAG 评测 runner（裸 fetch 版，不依赖 NestJS）。
 * 用法: tsx scripts/eval/run.ts --config <path> [--split dev|holdout|all] [--resume]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pLimit from 'p-limit';

import { cleanText, scoreAnswer, scoreRetrieval } from './scoring';

interface ExperimentConfig {
  assistantId?: string;
  datasetIds: string[];
  experimentId: string;
  retrieval: {
    keyword?: boolean;
    rerankId?: string;
    similarityThreshold?: number;
    topK?: number;
    topN?: number;
    vectorSimilarityWeight?: number;
  };
  split?: 'all' | 'dev' | 'holdout';
}

interface QuestionRow {
  id: number;
  mustContain: any[];
  mustNotContain: any[];
  question: string;
  reference: { doc: string; section: string };
  topic: string;
  useLLMJudge: boolean;
}

interface QuestionSet {
  questions: QuestionRow[];
  splits: { dev: number[]; holdout: number[] };
}

interface QuestionResult {
  answerScore: AnswerScore | null;
  answerText: string;
  durationMs: number;
  llmJudgeScore?: null | number;
  qid: number;
  question: string;
  retrieval: RetrievalScore;
  timestamp: string;
  topic: string;
}

const HOST = process.env.RAGFLOW_HOST ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';
const PROD_BLACKLIST = (process.env.RAGFLOW_PROD_KEY_BLACKLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!HOST || !API_KEY) {
  console.error('RAGFLOW_HOST / RAGFLOW_API_KEY required');
  process.exit(1);
}
if (PROD_BLACKLIST.includes(API_KEY)) {
  console.error('Refusing to run with blacklisted (production) API key');
  process.exit(1);
}

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
  let split: 'all' | 'dev' | 'holdout' | undefined;
  let resume = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--config': {
        configPath = argv[++i] ?? '';
        break;
      }
      case '--resume': {
        {
          resume = true;
          // No default
        }
        break;
      }
      case '--split': {
        split = (argv[++i] ?? 'dev') as 'all' | 'dev' | 'holdout';
        break;
      }
    }
  }
  if (!configPath) {
    console.error(
      'Usage: tsx run.ts --config <path> [--split dev|holdout|all] [--resume]',
    );
    process.exit(1);
  }
  return { configPath, split, resume };
}

async function callRetrieval(
  q: QuestionRow,
  cfg: ExperimentConfig,
): Promise<ChunkRef[]> {
  const body: Record<string, unknown> = {
    question: q.question,
    dataset_ids: cfg.datasetIds,
    top_k: cfg.retrieval.topK ?? 1024,
    similarity_threshold: cfg.retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: cfg.retrieval.vectorSimilarityWeight ?? 0.3,
    keyword: cfg.retrieval.keyword ?? false,
    page: 1,
    page_size: cfg.retrieval.topN ?? 6,
  };
  if (cfg.retrieval.rerankId) body.rerank_id = cfg.retrieval.rerankId;
  const data = await api<{ chunks?: any[] }>('POST', '/api/v1/retrieval', body);
  return (data.chunks ?? []).map((c: any) => ({
    documentName: c.document_name ?? c.docnm_kwd ?? '',
    similarity: c.similarity,
    vectorSimilarity: c.vector_similarity,
    termSimilarity: c.term_similarity,
  }));
}

const JUDGE_ASSISTANT_ID = process.env.RAGFLOW_JUDGE_ASSISTANT_ID ?? '';

/** LLM-as-judge 评分（用于概念题）。返回 0-1 之间的浮点数。 */
async function callLLMJudge(
  q: QuestionRow,
  modelAnswer: string,
  rubric: string,
): Promise<null | number> {
  if (!JUDGE_ASSISTANT_ID) return null;
  if (!rubric || !modelAnswer) return null;
  try {
    const session = await api<{ id: string }>(
      'POST',
      `/api/v1/chats/${JUDGE_ASSISTANT_ID}/sessions`,
      { name: `judge-q${q.id}-${Date.now()}` },
    );
    const prompt = [
      `问题：${q.question}`,
      ``,
      `参考答案：`,
      (q as any).answer?.raw ?? '',
      ``,
      `评分标准：`,
      rubric,
      ``,
      `模型回答：`,
      modelAnswer,
      ``,
      `请只输出一个 0 到 1 之间的小数（保留 2 位）。不要任何文字解释、不要 markdown、不要单位。`,
    ].join('\n');
    const data = await api<{ answer?: string }>(
      'POST',
      `/api/v1/chats/${JUDGE_ASSISTANT_ID}/completions`,
      { question: prompt, stream: false, session_id: session.id },
    );
    const raw = (data.answer ?? '').trim();
    // 抽第一个浮点数
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (!m?.[1]) return null;
    const score = Number.parseFloat(m[1]);
    if (Number.isNaN(score)) return null;
    return Math.max(0, Math.min(1, score));
  } catch (error) {
    console.warn(`Q${q.id}: judge call failed:`, (error as Error).message);
    return null;
  }
}

async function callChat(
  q: QuestionRow,
  cfg: ExperimentConfig,
): Promise<string> {
  if (!cfg.assistantId) return '';
  try {
    // RAGFlow 0.24 quirk: completions 第一次（无 session_id）返回开场白
    // 必须先建 session，再传 session_id 才能拿到真实回答
    const session = await api<{ id: string }>(
      'POST',
      `/api/v1/chats/${cfg.assistantId}/sessions`,
      { name: `eval-q${q.id}-${Date.now()}` },
    );
    const data = await api<{ answer?: string }>(
      'POST',
      `/api/v1/chats/${cfg.assistantId}/completions`,
      { question: q.question, stream: false, session_id: session.id },
    );
    return data.answer ?? '';
  } catch (error) {
    console.warn(`Q${q.id}: chat call failed:`, (error as Error).message);
    return '';
  }
}

/**
 * RAGFlow chat completions 走的是 assistant 自带的 retrieval 参数（不是 /api/v1/retrieval 那条路径）。
 * 跑实验前必须 PUT 更新 assistant 配置，否则不同 retrieval 参数对 chat 答案没影响。
 */
async function syncAssistantConfig(cfg: ExperimentConfig): Promise<void> {
  if (!cfg.assistantId) return;
  const body: Record<string, unknown> = {
    dataset_ids: cfg.datasetIds,
    similarity_threshold: cfg.retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: cfg.retrieval.vectorSimilarityWeight ?? 0.3,
    top_k: cfg.retrieval.topK ?? 1024,
    top_n: cfg.retrieval.topN ?? 6,
  };
  if (cfg.retrieval.rerankId) body.rerank_id = cfg.retrieval.rerankId;
  await api('PUT', `/api/v1/chats/${cfg.assistantId}`, body);
  console.log(
    `  assistant synced: top_k=${body.top_k} thr=${body.similarity_threshold} w=${body.vector_similarity_weight} top_n=${body.top_n}`,
  );
}

async function processOne(
  q: QuestionRow,
  cfg: ExperimentConfig,
  outputDir: string,
  resume: boolean,
): Promise<QuestionResult> {
  const filename = `q${String(q.id).padStart(2, '0')}.json`;
  const resultPath = resolve(outputDir, filename);
  if (resume && existsSync(resultPath)) {
    return JSON.parse(readFileSync(resultPath, 'utf8'));
  }
  const start = Date.now();
  const chunks = await callRetrieval(q, cfg);
  const retrieval = scoreRetrieval(chunks, q.reference);
  const answerText = cleanText(await callChat(q, cfg));
  let answerScore: AnswerScore | null = null;
  let llmJudgeScore: null | number = null;
  if (answerText) {
    if (q.useLLMJudge) {
      const rubric = (q as any).llmJudgeRubric ?? '';
      llmJudgeScore = await callLLMJudge(q, answerText, rubric);
    } else {
      answerScore = scoreAnswer(answerText, q.mustContain, q.mustNotContain);
    }
  }
  const result: QuestionResult & { llmJudgeScore?: null | number } = {
    qid: q.id,
    topic: q.topic,
    question: q.question,
    retrieval,
    answerText,
    answerScore,
    llmJudgeScore,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  return result;
}

function aggregate(results: QuestionResult[]) {
  const n = results.length;
  if (n === 0) return null;
  const sum = (sel: (r: QuestionResult) => number) =>
    results.reduce((s, r) => s + sel(r), 0);
  // 每题统一一个 0-1 分数：mustContain 走 finalScore，LLM-judge 走 llmJudgeScore
  const perQuestionScore = (r: QuestionResult): null | number => {
    if (r.answerScore != null) return r.answerScore.finalScore;
    if (r.llmJudgeScore != null) return r.llmJudgeScore;
    return null;
  };
  const scoredResults = results.filter((r) => perQuestionScore(r) != null);
  const totalScore =
    scoredResults.length > 0
      ? scoredResults.reduce((s, r) => s + (perQuestionScore(r) as number), 0) /
        scoredResults.length
      : 0;
  return {
    n,
    mrr: sum((r) => r.retrieval.mrr) / n,
    hitAt1: sum((r) => r.retrieval.hitAt1) / n,
    hitAt3: sum((r) => r.retrieval.hitAt3) / n,
    matched: sum((r) => (r.retrieval.matched ? 1 : 0)) / n,
    answerAvg: totalScore,
    answerScored: scoredResults.length,
    pending: results.filter((r) => perQuestionScore(r) == null && r.answerText)
      .length,
  };
}

function generateMarkdown(
  cfg: ExperimentConfig,
  results: QuestionResult[],
  agg: ReturnType<typeof aggregate>,
): string {
  if (!agg) return `# ${cfg.experimentId}\n\n（无结果）\n`;
  const lines: string[] = [];
  lines.push(`# ${cfg.experimentId}`, '');
  lines.push(
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Config',
    '```json',
  );
  lines.push(
    JSON.stringify(cfg.retrieval, null, 2),
    '```',
    '',
    '## Aggregate',
    `- N = ${agg.n}`,
  );
  lines.push(`- MRR = ${agg.mrr.toFixed(3)}`);
  lines.push(`- hit@1 = ${(agg.hitAt1 * 100).toFixed(1)}%`);
  lines.push(`- hit@3 = ${(agg.hitAt3 * 100).toFixed(1)}%`);
  lines.push(`- doc-match = ${(agg.matched * 100).toFixed(1)}%`);
  lines.push(
    `- answer-final-avg = ${(agg.answerAvg * 100).toFixed(1)}% (over ${agg.answerScored} scored, ${agg.pending} pending)`,
    '',
    '## Per-question',
    '| ID | Topic | hit@1 | hit@3 | rank | MRR | answer | crit-miss | not-pen |',
    '|----|-------|-------|-------|------|-----|--------|-----------|---------|',
  );
  for (const r of results) {
    const a = r.answerScore;
    lines.push(
      `| ${r.qid} | ${r.topic} | ${r.retrieval.hitAt1} | ${r.retrieval.hitAt3} | ${r.retrieval.rank} | ${r.retrieval.mrr.toFixed(2)} | ${a ? a.finalScore.toFixed(2) : 'judge'} | ${a?.criticalMissing ? 'Y' : '-'} | ${a?.mustNotContainPenalty ?? '-'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const {
    configPath,
    split: cliSplit,
    resume,
  } = parseArgs(process.argv.slice(2));
  const cfg: ExperimentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const split = cliSplit ?? cfg.split ?? 'dev';

  const setPath = resolve(__dirname, 'dataset/questions.json');
  const set: QuestionSet = JSON.parse(readFileSync(setPath, 'utf8'));
  const ids =
    split === 'all' ? set.questions.map((q) => q.id) : set.splits[split];
  const questions = set.questions.filter((q) => ids.includes(q.id));

  const outputDir = resolve(__dirname, 'results', cfg.experimentId);
  mkdirSync(outputDir, { recursive: true });

  console.log(`\nExperiment: ${cfg.experimentId}`);
  console.log(`Split: ${split} (${questions.length} questions)`);
  console.log(`Output: ${outputDir}`);
  console.log(`Host: ...${HOST.slice(-25)}  Key: ...${API_KEY.slice(-4)}`);

  // 关键：实验跑之前必须 PUT 更新 assistant 配置，否则 chat 完成走默认参数
  await syncAssistantConfig(cfg);
  console.log('');

  const limit = pLimit(3);
  const tasks = questions.map((q) =>
    limit(async () => {
      try {
        const r = await processOne(q, cfg, outputDir, resume);
        const mark = r.retrieval.matched ? '✓' : '✗';
        let ans = '?';
        if (r.answerScore) ans = `mc=${r.answerScore.finalScore.toFixed(2)}`;
        else if (r.llmJudgeScore != null)
          ans = `judge=${r.llmJudgeScore.toFixed(2)}`;
        else if (r.answerText) ans = 'pending';
        else ans = 'no-ans';
        console.log(
          `  ${mark} Q${r.qid} rank=${r.retrieval.rank} mrr=${r.retrieval.mrr.toFixed(2)} ${ans} (${r.durationMs}ms)`,
        );
        return r;
      } catch (error) {
        console.error(`  ✗ Q${q.id} ERROR:`, (error as Error).message);
        throw error;
      }
    }),
  );
  const results = await Promise.all(tasks);

  const agg = aggregate(results);
  writeFileSync(
    resolve(outputDir, 'summary.md'),
    generateMarkdown(cfg, results, agg),
  );

  if (agg) {
    console.log(
      `\nDone: MRR=${agg.mrr.toFixed(3)}  hit@1=${(agg.hitAt1 * 100).toFixed(1)}%  hit@3=${(agg.hitAt3 * 100).toFixed(1)}%  doc-match=${(agg.matched * 100).toFixed(1)}%  answer-avg=${(agg.answerAvg * 100).toFixed(1)}%  (judge-pending=${agg.llmJudgePending})`,
    );
  }
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
