/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , unicorn/prefer-single-call , no-console , no-lone-blocks , eqeqeq , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-member-access , @typescript-eslint/no-unsafe-argument , @typescript-eslint/no-unsafe-return , @typescript-eslint/restrict-template-expressions , @typescript-eslint/use-unknown-in-catch-callback-variable , turbo/no-undeclared-env-vars */
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

import {
  averageScores,
  parseJudgeScore,
  resolveJudgeReplicas,
  runReplicas,
} from './judge';
import { cleanText, scoreAnswer, scoreRetrieval } from './scoring';

interface ExperimentConfig {
  assistantId?: string;
  /** 题集相对路径（相对 scripts/eval/dataset/）；缺省读 questions.json（0420 第一批） */
  dataset?: string;
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
  llmJudgeReplicas?: (null | number)[];
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
  let dataset: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--config': {
        configPath = argv[++i] ?? '';
        break;
      }
      case '--dataset': {
        // 题集文件名（相对 scripts/eval/dataset/），覆盖 config.dataset
        dataset = argv[++i] ?? '';
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
      'Usage: tsx run.ts --config <path> [--split dev|holdout|all] [--resume] [--dataset <file>]',
    );
    process.exit(1);
  }
  return { configPath, split, resume, dataset };
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
const JUDGE_REPLICAS = resolveJudgeReplicas(process.env.EVAL_JUDGE_REPLICAS);

interface JudgeResult {
  replicas: (null | number)[];
  score: null | number;
}

/** 单次 judge 调用：建 session → 提交 prompt → 解析返回。失败抛出供 runReplicas 捕获。 */
async function callJudgeOnce(
  q: QuestionRow,
  modelAnswer: string,
  rubric: string,
): Promise<null | number> {
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
  return parseJudgeScore(data.answer ?? '');
}

/**
 * LLM-as-judge 评分（用于概念题）。
 * 串行跑 N 次（N = EVAL_JUDGE_REPLICAS，默认 3，避免 RAGFlow rate limit），
 * 单次失败跳过，全部失败才返回 score=null。
 * 返回均值（四舍五入到 2 位小数）+ 每次原始分数（用于事后审计）。
 */
async function callLLMJudge(
  q: QuestionRow,
  modelAnswer: string,
  rubric: string,
): Promise<JudgeResult> {
  if (!JUDGE_ASSISTANT_ID) return { score: null, replicas: [] };
  if (!rubric || !modelAnswer) return { score: null, replicas: [] };
  const replicas = await runReplicas(JUDGE_REPLICAS, async (i) => {
    try {
      return await callJudgeOnce(q, modelAnswer, rubric);
    } catch (error) {
      console.warn(
        `Q${q.id}: judge call ${i + 1}/${JUDGE_REPLICAS} failed:`,
        (error as Error).message,
      );
      throw error;
    }
  });
  return { score: averageScores(replicas), replicas };
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
  // 关键：RAGFlow PUT 是全量替换，遗漏的字段会回到默认值。
  // 必须先 GET 拿现有配置（特别是 prompt_config / llm_setting），再 merge 检索参数后 PUT，
  // 否则会把 prompt 清空。
  const existing = await api<any[]>(
    'GET',
    `/api/v1/chats?id=${cfg.assistantId}`,
  );
  const cur = existing[0] ?? {};
  const curPrompt = cur.prompt ?? {};
  const curLlm = cur.llm ?? {};
  const body: Record<string, unknown> = {
    name: cur.name ?? 'assistant',
    dataset_ids: cfg.datasetIds,
    llm_id: curLlm.model_name ?? 'deepseek-chat@DeepSeek',
    llm_setting: {
      temperature: curLlm.temperature ?? 0.1,
      top_p: curLlm.top_p ?? 0.3,
      presence_penalty: curLlm.presence_penalty ?? 0.4,
      frequency_penalty: curLlm.frequency_penalty ?? 0.7,
      max_tokens: curLlm.max_tokens ?? 512,
    },
    similarity_threshold: cfg.retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: cfg.retrieval.vectorSimilarityWeight ?? 0.3,
    top_k: cfg.retrieval.topK ?? 1024,
    top_n: cfg.retrieval.topN ?? 6,
    // RAGFlow 字段命名错位：GET 返回 prompt.prompt（system 字符串），
    // PUT 接受 prompt_config.system —— 必须做映射
    prompt_config: {
      system: curPrompt.prompt ?? '',
      parameters: curPrompt.variables ?? [
        { key: 'knowledge', optional: false },
      ],
      empty_response: curPrompt.empty_response ?? '',
      opener: curPrompt.opener ?? '',
      quote: curPrompt.show_quote ?? true,
      refine_multiturn: curPrompt.refine_multiturn ?? true,
    },
  };
  if (cfg.retrieval.rerankId) body.rerank_id = cfg.retrieval.rerankId;
  await api('PUT', `/api/v1/chats/${cfg.assistantId}`, body);
  console.log(
    `  assistant synced: top_k=${body.top_k} thr=${body.similarity_threshold} w=${body.vector_similarity_weight} top_n=${body.top_n}  prompt_len=${(curPrompt.prompt ?? '').length}`,
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
  let llmJudgeReplicas: (null | number)[] | undefined;
  if (answerText) {
    if (q.useLLMJudge) {
      const rubric = (q as any).llmJudgeRubric ?? '';
      const judge = await callLLMJudge(q, answerText, rubric);
      llmJudgeScore = judge.score;
      llmJudgeReplicas = judge.replicas;
    } else {
      answerScore = scoreAnswer(answerText, q.mustContain, q.mustNotContain);
    }
  }
  const result: QuestionResult = {
    qid: q.id,
    topic: q.topic,
    question: q.question,
    retrieval,
    answerText,
    answerScore,
    llmJudgeScore,
    llmJudgeReplicas,
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
    dataset: cliDataset,
  } = parseArgs(process.argv.slice(2));
  const cfg: ExperimentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const split = cliSplit ?? cfg.split ?? 'dev';
  const datasetFile = cliDataset ?? cfg.dataset ?? 'questions.json';

  const setPath = resolve(__dirname, 'dataset', datasetFile);
  const set: QuestionSet = JSON.parse(readFileSync(setPath, 'utf8'));
  const ids =
    split === 'all' ? set.questions.map((q) => q.id) : set.splits[split];
  const questions = set.questions.filter((q) => ids.includes(q.id));

  const outputDir = resolve(__dirname, 'results', cfg.experimentId);
  mkdirSync(outputDir, { recursive: true });

  console.log(`\nExperiment: ${cfg.experimentId}`);
  console.log(`Dataset: ${datasetFile}`);
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
      `\nDone: MRR=${agg.mrr.toFixed(3)}  hit@1=${(agg.hitAt1 * 100).toFixed(1)}%  hit@3=${(agg.hitAt3 * 100).toFixed(1)}%  doc-match=${(agg.matched * 100).toFixed(1)}%  answer-avg=${(agg.answerAvg * 100).toFixed(1)}%  (judge-pending=${agg.pending})`,
    );
  }
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
