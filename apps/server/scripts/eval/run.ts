/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , unicorn/prefer-single-call , no-console , no-lone-blocks , eqeqeq , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-member-access , @typescript-eslint/no-unsafe-argument , @typescript-eslint/no-unsafe-return , @typescript-eslint/restrict-template-expressions , @typescript-eslint/use-unknown-in-catch-callback-variable */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import type {
  AnswerScore,
  ChunkRef,
  RetrievalCoverage,
  RetrievalScore,
} from './scoring';

/**
 * RAG 评测 runner（裸 fetch 版，不依赖 NestJS）。
 * 用法: tsx scripts/eval/run.ts --config <path> [--split dev|holdout|all] [--resume]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pLimit from 'p-limit';

import {
  DEFAULT_ASSISTANT_FREQUENCY_PENALTY,
  DEFAULT_ASSISTANT_PRESENCE_PENALTY,
} from '../../src/common/defaults/assistant.defaults';
import {
  averageScores,
  parseJudgeScore,
  resolveJudgeReplicas,
  runReplicas,
} from './judge';
import {
  cleanText,
  scoreAnswer,
  scoreRetrieval,
  scoreRetrievalCoverage,
} from './scoring';

interface ExperimentConfig {
  assistantId?: string;
  /** 题集相对路径（相对 scripts/eval/dataset/）；缺省读 questions.json（0420 第一批） */
  dataset?: string;
  datasetIds: string[];
  experimentId: string;
  retrieval: {
    keyword?: boolean;
    /**
     * rerank 的候选池大小（RAGFlow 静默默认 64）。
     * 链路是「混合检索出 top_k 个 → 只对前 rerank_candidates_count 个重排 → 取 top_n」，
     * 所以真正的召回上限是这个值而不是 top_k：排在它之外的 chunk 连被 rerank 评估的
     * 机会都没有，调大 top_n 也捞不回来。语料库变大后它会先成为瓶颈。
     */
    rerankCandidatesCount?: number;
    rerankId?: string;
    similarityThreshold?: number;
    topK?: number;
    topN?: number;
    vectorSimilarityWeight?: number;
  };
  split?: 'all' | 'dev' | 'holdout';
}

interface QuestionRow {
  /** 参考答案原文；chunk 级覆盖度判定的取数来源 */
  answer?: { raw: string };
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
  /** chunk 级召回覆盖度，补文档级 hit@1 看不见的段落级失败 */
  coverage: RetrievalCoverage;
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
    // 必须显式传：/api/v1/retrieval 不读 assistant 配置，漏传就退回 RAGFlow 默认的 64。
    // 那样检索指标（hit@1 / chunk 覆盖度）量的是 64 候选池，而答案是助手用 128 生成的，
    // 两条链路口径不一致，诊断会指向错误的地方。RAGFlow 还要求它 ≥ page × page_size。
    rerank_candidates_count: cfg.retrieval.rerankCandidatesCount ?? 64,
  };
  if (cfg.retrieval.rerankId) body.rerank_id = cfg.retrieval.rerankId;
  const data = await api<{ chunks?: any[] }>('POST', '/api/v1/retrieval', body);
  return (data.chunks ?? []).map((c: any) => ({
    documentName: c.document_name ?? c.docnm_kwd ?? '',
    // 正文是 chunk 级判定的唯一依据；只映射文件名的旧口径看不见「文档对了、段落没排进来」
    content: c.content ?? c.content_with_weight ?? '',
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
  const existing = await api<any>('GET', `/api/v1/chats?id=${cfg.assistantId}`);
  // RAGFlow 0.27 起 data 是 { chats, total }；0.26 及更早直接返回数组。
  const chats: any[] = Array.isArray(existing)
    ? existing
    : (existing?.chats ?? []);
  const cur = chats[0];
  // 拿不到现有配置就必须停下。PUT 是全量替换，带着兜底值写回去会把线上助手的
  // 模型绑定和 prompt 一起冲掉 —— 0.27 改返回结构时就差点这么干（兜底的
  // `deepseek-chat@DeepSeek` 恰好不存在、PUT 被 RAGFlow 拒了才没酿成事故）。
  if (!cur) {
    throw new Error(
      `assistant ${cfg.assistantId} not found in GET /api/v1/chats; refusing to PUT defaults over it`,
    );
  }
  // 0.27 把配置平铺成 llm_id / llm_setting / prompt_config；
  // 0.26 及更早是嵌套的 llm{model_name,...} 与 prompt{prompt, variables,...}。
  const curLlm = cur.llm ?? {};
  const curPrompt = cur.prompt ?? {};
  const curSetting = cur.llm_setting ?? curLlm;
  const llmId = cur.llm_id ?? curLlm.model_name;
  const promptConfig = cur.prompt_config ?? {
    empty_response: curPrompt.empty_response ?? '',
    opener: curPrompt.opener ?? '',
    parameters: curPrompt.variables ?? [{ key: 'knowledge', optional: false }],
    quote: curPrompt.show_quote ?? true,
    refine_multiturn: curPrompt.refine_multiturn ?? true,
    system: curPrompt.prompt ?? '',
  };
  if (!llmId || !promptConfig.system) {
    throw new Error(
      `assistant ${cfg.assistantId}: GET returned no llm_id / system prompt (RAGFlow response shape changed?); refusing to PUT and wipe them`,
    );
  }
  const body: Record<string, unknown> = {
    name: cur.name ?? 'assistant',
    dataset_ids: cfg.datasetIds,
    llm_id: llmId,
    llm_setting: {
      temperature: curSetting.temperature ?? 0.1,
      top_p: curSetting.top_p ?? 0.3,
      presence_penalty:
        curSetting.presence_penalty ?? DEFAULT_ASSISTANT_PRESENCE_PENALTY,
      frequency_penalty:
        curSetting.frequency_penalty ?? DEFAULT_ASSISTANT_FREQUENCY_PENALTY,
      max_tokens: curSetting.max_tokens ?? 512,
    },
    similarity_threshold: cfg.retrieval.similarityThreshold ?? 0.2,
    vector_similarity_weight: cfg.retrieval.vectorSimilarityWeight ?? 0.3,
    top_k: cfg.retrieval.topK ?? 1024,
    top_n: cfg.retrieval.topN ?? 6,
    // PUT 是全量替换：不带上这个字段，助手上已设的值会被打回默认 64
    rerank_candidates_count:
      cfg.retrieval.rerankCandidatesCount ?? cur.rerank_candidates_count ?? 64,
    prompt_config: promptConfig,
  };
  if (cfg.retrieval.rerankId) body.rerank_id = cfg.retrieval.rerankId;
  await api('PUT', `/api/v1/chats/${cfg.assistantId}`, body);
  console.log(
    `  assistant synced: top_k=${body.top_k} thr=${body.similarity_threshold} w=${body.vector_similarity_weight} top_n=${body.top_n} rerank_cand=${body.rerank_candidates_count}  prompt_len=${promptConfig.system.length}`,
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
  const coverage = scoreRetrievalCoverage(chunks, q.answer?.raw ?? '');
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
    coverage,
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
  // 检索指标只统计「有正确文档可召回」的题。参考答案为"知识库里没有"的
  // 检索边界题（0820 的 Q24/Q27）无从评判召回，计入分母会把指标永久压在
  // 封顶值以下 —— 详见 RetrievalScore.applicable 的注释。
  const retrievable = results.filter((r) => r.retrieval.applicable);
  const rn = retrievable.length;
  const sum = (sel: (r: QuestionResult) => number) =>
    retrievable.reduce((s, r) => s + sel(r), 0);
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
  // chunk 级覆盖度只统计「参考答案里有数值可判」的题：定性题（"四级质量检查制度"
  // 这类）没有可机器判定的锚点，计入分母会把指标压低成一个看不懂的数。
  const coverable = results.filter((r) => r.coverage?.applicable);
  const cn = coverable.length;
  return {
    n,
    retrievalN: rn,
    retrievalSkipped: n - rn,
    coverageN: cn,
    chunkCoverage:
      cn > 0 ? coverable.reduce((s, r) => s + r.coverage.ratio, 0) / cn : 0,
    mrr: rn > 0 ? sum((r) => r.retrieval.mrr) / rn : 0,
    hitAt1: rn > 0 ? sum((r) => r.retrieval.hitAt1) / rn : 0,
    hitAt3: rn > 0 ? sum((r) => r.retrieval.hitAt3) / rn : 0,
    matched: rn > 0 ? sum((r) => (r.retrieval.matched ? 1 : 0)) / rn : 0,
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
  lines.push(
    `- 检索指标口径 = ${agg.retrievalN}/${agg.n} 题${agg.retrievalSkipped > 0 ? `（${agg.retrievalSkipped} 题参考答案为"知识库中没有"，无正确文档可召回，已排除）` : ''}`,
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

  // 并发默认 3。调大 rerank_candidates_count 后，rerank 侧的文本量成倍增长，
  // 外部 rerank 服务（SiliconFlow）会返回 429 —— 这种实验要用 EVAL_CONCURRENCY 降并发。
  const concurrency = Math.max(
    1,
    Math.min(8, Number(process.env.EVAL_CONCURRENCY) || 3),
  );
  const limit = pLimit(concurrency);
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
      `\nDone: MRR=${agg.mrr.toFixed(3)}  hit@1=${(agg.hitAt1 * 100).toFixed(1)}%  hit@3=${(agg.hitAt3 * 100).toFixed(1)}%  doc-match=${(agg.matched * 100).toFixed(1)}%  (检索口径 ${agg.retrievalN}/${agg.n} 题${agg.retrievalSkipped > 0 ? `，${agg.retrievalSkipped} 题无参考文档已排除` : ''})  answer-avg=${(agg.answerAvg * 100).toFixed(1)}%  (judge-pending=${agg.pending})\n      chunk 级召回覆盖度=${(agg.chunkCoverage * 100).toFixed(1)}%  (可判定 ${agg.coverageN}/${agg.n} 题，其余题参考答案里没有可机器判定的数值)`,
    );
  }
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
