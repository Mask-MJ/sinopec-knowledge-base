/* eslint-disable unicorn/prefer-module , unicorn/prefer-string-slice , unicorn/no-process-exit , no-cond-assign , no-console , regexp/no-dupe-disjunctions , regexp/no-obscure-range */
// cspell:disable-file
// 评测题集导入器：把 test-docs/<批次>/RAG问题和参考答案*.docx 解析成
// dataset/ 下的题集 JSON。三个批次共用，靠 BATCHES 表切换。
//
//   pnpm tsx scripts/eval/import-questions.ts --batch 0820
//   pnpm tsx scripts/eval/import-questions.ts --batch 0420 --dry-run
//
// ⚠️ 不要用它重跑 questions.json（0420）——那份基线 2026-05-04 生成后就与
// 脚本脱钩了：① 7 道概念题带人工逐题手写的 rubric，脚本只会写通用 rubric；
// ② 此后 autoMustContain 的数值正则放宽过，重跑会给 id=17/18/19/20 抽出
// mustContain，把它们从 LLM judge 改判成自动数值断言，评分口径直接变。
// questions-0520.json 同样被人工修过（id=21 的 reference.doc 是手工填的，
// 既非书名号内容也非脚本能抽出的值）。两份基线都只读。
// 要比对先 --dry-run 或 --out 到别处，别直接覆盖。
//
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface BatchConfig {
  /** 题面用简称、跟真实语料文件名对不上时的显式映射（脚本会报告漏网的）。 */
  docAliases?: Record<string, string>;
  docx: string;
  out: string;
  /** 有序，先命中先归类（如"顺中二期"必须排在"顺中"前面）。 */
  topics: Array<[string, RegExp]>;
}

const BATCHES: Record<string, BatchConfig> = {
  '0420': {
    docAliases: {
      // 题面写"2014年度"，语料文件名是"2014年…-打印"
      '2014年度页岩气地震攻关试验项目采集报告':
        '2014年页岩气地震攻关试验项目采集报告-打印_noimg',
    },
    docx: 'test-docs/0420/RAG问题和参考答案.docx',
    out: 'questions.json',
    topics: [
      ['shunbei43', /43井|顺北\s*43/],
      ['shunbei42', /42井|顺北\s*42/],
      ['shunbei21', /21井|顺北\s*21/],
      ['shale', /页岩气|彭水/],
    ],
  },
  '0520': {
    docAliases: {
      // 题面漏了"资料"二字
      '2018-2019年度苏北盆地高邮凹陷永安高密度三维地震采集项目采集总结报告':
        '2018-2019年度苏北盆地高邮凹陷永安高密度三维地震资料采集项目采集总结报告_noimg',
      // 题面多了"采集"二字
      安徽宿南二维地震采集处理解释作业与服务采集施工设计:
        '安徽宿南二维地震采集处理解释作业与服务施工设计_noimg',
    },
    docx: 'test-docs/0520/RAG问题和参考答案-30.docx',
    out: 'questions-0520.json',
    topics: [
      ['zhentong-shijiabu', /史家堡|草舍/],
      ['zhentong-shuaiduo', /帅垛/],
      ['yongan', /永安/],
      ['shunzhong2', /顺中二期/],
      ['shunzhong', /顺中/],
      ['shun8', /顺8|顺八/],
      ['sunan', /宿南/],
      ['zhangji', /张集东/],
      ['fangshan', /方山/],
      ['suyong', /苏北|高邮/],
    ],
  },
  '0820': {
    docx: 'test-docs/0820/RAG问题和参考答案-data32.docx',
    out: 'questions-0820.json',
    docAliases: {
      梁北煤矿三维地震勘探项目试验总结:
        '梁北二井（12采区）三维地震勘探试验总结',
    },
    topics: [
      ['jinzhong', /晋中|沁水/],
      ['landian', /林甸/],
      ['chagannaoer', /查干淖尔/],
      ['panxie', /潘谢东/],
      ['liangbei', /梁北/],
      ['bamai', /巴麦/],
    ],
  },
};

const argv = process.argv.slice(2);
const batch = argv[argv.indexOf('--batch') + 1] ?? '';
const dryRun = argv.includes('--dry-run');
/** 生成到别处，用于跟既有基线比对而不覆盖它。 */
const outOverride = argv.includes('--out')
  ? argv[argv.indexOf('--out') + 1]
  : undefined;
function loadBatch(name: string): BatchConfig {
  const found = argv.includes('--batch') ? BATCHES[name] : undefined;
  if (found) return found;
  console.error(
    `用法: tsx scripts/eval/import-questions.ts --batch <${Object.keys(
      BATCHES,
    ).join(' | ')}> [--dry-run] [--out <path>]`,
  );
  process.exit(1);
}

const config = loadBatch(batch);

const REPO_ROOT = resolve(__dirname, '../../../..');
const DOCX_PATH = resolve(REPO_ROOT, config.docx);
const OUT_DIR = resolve(__dirname, 'dataset');
const OUT_PATH = outOverride
  ? resolve(process.cwd(), outOverride)
  : resolve(OUT_DIR, config.out);

mkdirSync(OUT_DIR, { recursive: true });

/** 同批次的真实语料文件名（去扩展名），用来把【说明】里的文档名归一。 */
const CORPUS_NAMES = readdirSync(resolve(REPO_ROOT, dirname(config.docx)))
  .filter(
    (f) => /\.(?:docx?|pdf)$/i.test(f) && !f.startsWith('RAG问题和参考答案'),
  )
  .map((f) => f.replace(/\.[^.]+$/, ''));

const xml = execFileSync('unzip', ['-p', DOCX_PATH, 'word/document.xml'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
const paragraphs: string[] = [];
let pm: null | RegExpExecArray;
while ((pm = paraRegex.exec(xml)) !== null) {
  let tm: null | RegExpExecArray;
  const buf: string[] = [];
  textRegex.lastIndex = 0;
  while ((tm = textRegex.exec(pm[0])) !== null) {
    if (tm[1] !== undefined) buf.push(tm[1]);
  }
  if (buf.length > 0) paragraphs.push(buf.join('').trim());
}

type RawQ = {
  answer: string;
  explanation: string;
  id: number;
  question: string;
  tags: string[];
};

const raw: RawQ[] = [];
let cur: null | {
  answer: string;
  explanation: string;
  question: string;
  tags: string[];
} = null;
let mode: 'answer' | 'explanation' | 'question' | null = null;
/** 0820 里题型标签偶尔折行到【问题】前单独成段，先攒着挂给下一题。 */
let pendingTags: string[] = [];

const flush = () => {
  if (cur && cur.question) {
    raw.push({ id: raw.length + 1, ...cur });
  }
  cur = null;
  mode = null;
};

/** 整段只由【xxx】组成，如【问题】【方法名/列举】【numeric】。 */
const isMarkLine = (p: string) => /^(?:【[^】]+】)+$/.test(p);

for (const p of paragraphs) {
  if (!p) continue;
  if (isMarkLine(p)) {
    const marks = [...p.matchAll(/【([^】]+)】/g)].map((m) => m[1] ?? '');
    if (marks.includes('问题')) {
      flush();
      cur = {
        question: '',
        answer: '',
        explanation: '',
        tags: [...pendingTags, ...marks.filter((m) => m !== '问题')],
      };
      pendingTags = [];
      mode = 'question';
      continue;
    }
    if (marks.includes('答案')) {
      mode = 'answer';
      continue;
    }
    if (marks.includes('说明')) {
      mode = 'explanation';
      continue;
    }
    pendingTags.push(...marks);
    continue;
  }
  if (!cur || !mode) continue;
  const sep = cur[mode] ? '\n' : '';
  cur[mode] = cur[mode] + sep + p;
}
flush();

/**
 * 0820 有整句被中文引号包裹的题面；而"「XX项目」的面积是多少？"这种
 * 项目名引号在句中，必须保留。只剥掉首尾成对、且内部再无引号的那层。
 */
function stripWrappingQuotes(question: string): string {
  const m = question.match(/^[“"]([\s\S]+)[”"]$/);
  const inner = m?.[1];
  if (!inner || /[“”"]/.test(inner)) return question;
  return inner;
}

/**
 * 解析【说明】里的"参考文档：xxx"片段。题面混用引号和书名号两种引法。
 *
 * 书名号优先：它是文档名的明确标记，而引号有歧义——0520 有题的【说明】里
 * 写着「问题中的"简要"不算最符合」，引号优先会把"简要"当成参考文档。
 */
function parseExplanation(exp: string): { doc: string; section: string } {
  const quoteMatch = exp.match(/[“"]([^“”"\n《》]+)[”"]/);
  const bookMatch = exp.match(/《([^《》\n]+)》/);
  const doc = bookMatch?.[1] ?? quoteMatch?.[1] ?? '';
  let section = exp;
  if (doc) {
    section = exp
      .replaceAll(/参考文档[:：]?/g, '')
      .replace(`"${doc}"`, '')
      .replace(`“${doc}”`, '')
      .replace(`《${doc}》`, '')
      .trim();
  }
  section = section.replaceAll(/^[，,。.\s]+|[，,。.\s]+$/g, '');
  return { doc, section };
}

type FactItem = {
  context?: string;
  pattern: string;
  severity?: 'critical' | 'supporting';
  type: 'number' | 'regex' | 'string';
  unit?: string;
};

function autoMustContain(answer: string): FactItem[] {
  const items: FactItem[] = [];
  const seen = new Set<string>();
  const numberSpans: Array<[number, number]> = [];
  const push = (it: FactItem) => {
    const key = `${it.type}:${it.pattern}:${it.unit ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };

  const numUnitRe =
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d*)?)\s*(km²|km2|平方千米|平方公里|m²|m2|km|[m米次个束炮%°d天年月日根站线]|m\/s|mm)/g;
  let nm: null | RegExpExecArray;
  while ((nm = numUnitRe.exec(answer)) !== null) {
    const num = nm[1];
    const unit = nm[2];
    if (!num || !unit) continue;
    const ctxStart = Math.max(0, nm.index - 18);
    push({
      pattern: num,
      type: 'number',
      unit,
      context: answer.substring(ctxStart, nm.index).replaceAll(/\s+/g, ''),
    });
    numberSpans.push([nm.index, nm.index + num.length]);
  }

  // bare number：跳过被 numUnitRe 已覆盖（含子串）的位置。
  //
  // `(?!\d)` 不能省：没有它时，"101515788铺设" 会因后瞻 (?!\s*[一-龥]) 失败而
  // 回溯，匹配出更短的 "10151578"——一个原文里根本不存在的数字，于是造出永远
  // 无法命中的必答事实。0820 题集 114 条数值里曾有 8 条是这么来的，必然判 0。
  const bareNumRe = /(?<![A-Z0-9.])(\d{4,})(?!\d)(?!\s*[A-Z一-龥%°])/gi;
  let bm: null | RegExpExecArray;
  while ((bm = bareNumRe.exec(answer)) !== null) {
    const num = bm[1];
    if (!num) continue;
    const [s, e] = [bm.index, bm.index + num.length];
    const overlap = numberSpans.some(([rs, re]) => !(e <= rs || s >= re));
    if (overlap) continue;
    push({
      pattern: num,
      type: 'number',
      context: answer
        .substring(Math.max(0, bm.index - 18), bm.index)
        .replaceAll(/\s+/g, ''),
    });
    numberSpans.push([s, e]);
  }

  const wellRe = /[A-Z]{2,3}\d+J\d+/g;
  let wm: null | RegExpExecArray;
  while ((wm = wellRe.exec(answer)) !== null) {
    push({ pattern: wm[0], type: 'string', context: '井号/控制点编号' });
  }

  const coordRe = /(195[46]年?[^，,。\s]*?(?:坐标系|高程))/g;
  let cm: null | RegExpExecArray;
  while ((cm = coordRe.exec(answer)) !== null) {
    if (cm[1]) push({ pattern: cm[1], type: 'string', context: '坐标/高程系' });
  }

  const zoneRe = /(高斯[36]°分带?)/g;
  let zm: null | RegExpExecArray;
  while ((zm = zoneRe.exec(answer)) !== null) {
    if (zm[1]) push({ pattern: zm[1], type: 'string', context: '高斯分带' });
  }

  const dateRe =
    /(\d{4}[.\-年]\s*\d{1,2}\s*[.\-月]\s*\d{1,2}\s*日?|\d{4}年\d{1,2}月)/g;
  let dm: null | RegExpExecArray;
  while ((dm = dateRe.exec(answer)) !== null) {
    if (dm[1]) push({ pattern: dm[1], type: 'string', context: '日期' });
  }

  return items;
}
/**
 * 【说明】里的引号常把"文档名 章节"一起括进去（0820 有 4 题如此），而题面
 * 写的文档名又可能比真实文件名少一截（如少了"(end)"）。对着真实语料文件名
 * 双向前缀对齐：doc 统一成真实文件名，多出来的部分退回 section。
 * 对不上的（【检索边界】题写"全文无对应章节"）原样保留。
 */
function normalizeDoc(doc: string): { doc: string; section: string } {
  if (!doc) return { doc, section: '' };
  const alias = config.docAliases?.[doc];
  if (alias) return { doc: alias, section: '' };
  const hit = CORPUS_NAMES.filter(
    (n) => doc.startsWith(n) || n.startsWith(doc),
  ).sort((a, b) => b.length - a.length)[0];
  if (!hit) return { doc, section: '' };
  return {
    doc: hit,
    section: doc.startsWith(hit) ? doc.slice(hit.length).trim() : '',
  };
}

/**
 * 工区主题分类：题面 + 答案 + 参考文档名联合判定，便于按工区做
 * dev/holdout split。跨工区对比题靠客户标的【跨项目】直接归类——
 * 它的答案会同时提到多个工区，关键词判不准。
 */
function classifyTopic(
  answer: string,
  question: string,
  ref: string,
  tags: string[],
): string {
  if (tags.includes('跨项目')) return 'cross-project';
  const text = `${ref} ${answer} ${question}`;
  for (const [topic, re] of config.topics) {
    if (re.test(text)) return topic;
  }
  return 'other';
}

const questions = raw.map((q) => {
  const parsed = parseExplanation(q.explanation);
  const normalized = normalizeDoc(parsed.doc);
  const ref = {
    doc: normalized.doc,
    section: [normalized.section, parsed.section].filter(Boolean).join(' '),
  };
  const topic = classifyTopic(q.answer, q.question, ref.doc, q.tags);
  const mustContain = autoMustContain(q.answer);
  // 【检索边界】【简答】是客户标的概念/边界题，答案常是"文档未写明"，
  // 自动抽出的数值事实对它们没意义，一律交给 LLM judge。
  const conceptual = q.tags.some((t) => t === '检索边界' || t === '简答');
  const useLLMJudge = conceptual || mustContain.length === 0;
  // 没有人工 rubric 的题写一个通用 rubric，让 LLM judge 能跑分：
  // 给定参考答案后按"关键事实覆盖 / 准确性 / 完整性"三档打分。
  const llmJudgeRubric = useLLMJudge
    ? [
        '通用评分（0.00-1.00 一位小数，按下列三档加权）：',
        '- 关键事实覆盖（0.60）：模型答案是否提到参考答案中的核心事实、要点、清单项目',
        '- 准确性（0.30）：是否与参考答案矛盾，是否编造',
        '- 完整性（0.10）：列举/枚举型问题是否尽量完整',
        '',
        '判定速查：',
        '- 完全覆盖关键事实且无错误 → 1.00',
        '- 覆盖约一半关键事实且无错误 → 0.50',
        '- 覆盖一两项 / 含轻微错误 → 0.20-0.40',
        '- 完全跑题 / 编造 / 未回答 → 0.00',
      ].join('\n')
    : '';
  return {
    id: q.id,
    topic,
    tags: q.tags,
    question: stripWrappingQuotes(q.question),
    reference: ref,
    answer: { raw: q.answer },
    mustContain,
    mustNotContain: [] as Array<{
      pattern: string;
      reason?: string;
      type: 'regex' | 'string';
    }>,
    useLLMJudge,
    llmJudgeRubric,
    notes: q.explanation.match(/[(（](?!参考)[^)）]+[)）]/g)?.join(' | ') ?? '',
  };
});

const byTopic: Record<string, number[]> = {};
for (const q of questions) (byTopic[q.topic] ??= []).push(q.id);
const dev: number[] = [];
const holdout: number[] = [];
for (const ids of Object.values(byTopic)) {
  const splitIdx = Math.ceil(ids.length * 0.6);
  dev.push(...ids.slice(0, splitIdx));
  holdout.push(...ids.slice(splitIdx));
}

const out = {
  version: '0.1.0',
  source: config.docx,
  generatedAt: new Date().toISOString(),
  splits: {
    dev: dev.sort((a, b) => a - b),
    holdout: holdout.sort((a, b) => a - b),
  },
  topicDistribution: Object.fromEntries(
    Object.entries(byTopic).map(([k, v]) => [k, v.length]),
  ),
  questions,
};

const tagDistribution: Record<string, number> = {};
for (const q of questions)
  for (const t of q.tags) tagDistribution[t] = (tagDistribution[t] ?? 0) + 1;

console.log(`[${batch}] ${questions.length} questions from ${config.docx}`);
console.log(`Splits: dev=${dev.length}, holdout=${holdout.length}`);
console.log(`Topics:`, out.topicDistribution);
if (Object.keys(tagDistribution).length > 0)
  console.log(`Tags:`, tagDistribution);
console.log(
  `LLM-judge questions: ${questions.filter((q) => q.useLLMJudge).length}`,
);
// doc 对不上真实语料文件名 → 评测时的"检索是否命中正确文档"判定会失真，
// 补一条 docAliases 即可。（【检索边界】题本就无对应文档，doc 为空，跳过。）
const unaligned = questions.filter(
  (q) => q.reference.doc && !CORPUS_NAMES.includes(q.reference.doc),
);
if (unaligned.length > 0) {
  console.warn(
    `⚠️  ${unaligned.length} 题的参考文档对不上 ${dirname(config.docx)} 里的语料，请补 docAliases：`,
  );
  for (const q of unaligned) console.warn(`    id=${q.id}  ${q.reference.doc}`);
}
console.log(
  `Avg must_contain per question: ${(
    questions.reduce((s, q) => s + q.mustContain.length, 0) / questions.length
  ).toFixed(1)}`,
);
if (dryRun) {
  console.log(`--dry-run: 未写入 ${OUT_PATH}`);
} else {
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT_PATH}`);
}
