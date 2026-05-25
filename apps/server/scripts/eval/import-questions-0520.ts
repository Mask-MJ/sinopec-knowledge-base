/* eslint-disable unicorn/prefer-module , unicorn/prefer-string-slice , no-cond-assign , no-console , regexp/no-dupe-disjunctions , regexp/no-obscure-range */
// cspell:disable-file
// 0520 客户第二批评测题集导入器。与 import-questions.ts 主体逻辑同源，差异：
//   1) DOCX 源切换到 test-docs/0520/RAG问题和参考答案-30.docx
//   2) 输出 dataset/questions-0520.json
//   3) parseExplanation 增加书名号《》识别（0520 题面混用引号与书名号）
//   4) classifyTopic 重写为 0520 工程项目主题分类
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOCX_PATH = resolve(
  __dirname,
  '../../../../test-docs/0520/RAG问题和参考答案-30.docx',
);
const OUT_DIR = resolve(__dirname, 'dataset');
const OUT_PATH = resolve(OUT_DIR, 'questions-0520.json');

mkdirSync(OUT_DIR, { recursive: true });

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
};

const raw: RawQ[] = [];
let cur: null | { answer: string; explanation: string; question: string } =
  null;
let mode: 'answer' | 'explanation' | 'question' | null = null;

const flush = () => {
  if (cur && cur.question) {
    raw.push({ id: raw.length + 1, ...cur });
  }
  cur = null;
  mode = null;
};

for (const p of paragraphs) {
  if (!p) continue;
  if (p === '【问题】') {
    flush();
    cur = { question: '', answer: '', explanation: '' };
    mode = 'question';
    continue;
  }
  if (p === '【答案】') {
    mode = 'answer';
    continue;
  }
  if (p === '【说明】') {
    mode = 'explanation';
    continue;
  }
  if (!cur || !mode) continue;
  const sep = cur[mode] ? '\n' : '';
  cur[mode] = cur[mode] + sep + p;
}
flush();

/**
 * 解析【说明】里的"参考文档：xxx"片段。
 * 0520 题面混用了引号和书名号两种引法（"xxx" / 《xxx》），需都识别。
 */
function parseExplanation(exp: string): { doc: string; section: string } {
  const quoteMatch = exp.match(/[“"]([^“”"\n《》]+)[”"]/);
  const bookMatch = exp.match(/《([^《》\n]+)》/);
  const doc = quoteMatch?.[1] ?? bookMatch?.[1] ?? '';
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

  // bare number：跳过被 numUnitRe 已覆盖（含子串）的位置
  const bareNumRe = /(?<![A-Z0-9.])(\d{4,})(?!\s*[A-Z一-龥%°])/gi;
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
 * 0520 工程项目主题分类。
 * 题面 + 答案 + 参考文档名联合判定，便于按工区做 dev/holdout split。
 */
type Topic =
  | 'fangshan'
  | 'other'
  | 'shun8'
  | 'shunzhong2'
  | 'shunzhong'
  | 'sunan'
  | 'suyong'
  | 'yongan'
  | 'zhangji'
  | 'zhentong-shijiabu'
  | 'zhentong-shuaiduo';

function classifyTopic(answer: string, question: string, ref: string): Topic {
  const text = `${ref} ${answer} ${question}`;
  if (text.includes('史家堡') || text.includes('草舍'))
    return 'zhentong-shijiabu';
  if (text.includes('帅垛')) return 'zhentong-shuaiduo';
  if (text.includes('永安')) return 'yongan';
  if (text.includes('顺中二期')) return 'shunzhong2';
  if (text.includes('顺中')) return 'shunzhong';
  if (text.includes('顺8') || text.includes('顺八')) return 'shun8';
  if (text.includes('安徽宿南') || text.includes('宿南')) return 'sunan';
  if (text.includes('张集东')) return 'zhangji';
  if (text.includes('方山')) return 'fangshan';
  if (text.includes('苏北') || text.includes('高邮')) return 'suyong';
  return 'other';
}

const questions = raw.map((q) => {
  const ref = parseExplanation(q.explanation);
  const topic = classifyTopic(q.answer, q.question, ref.doc);
  const mustContain = autoMustContain(q.answer);
  // 概念题启发式：mustContain 抽不出 || 答案以"（1）/（2）/...."等分点开头但全是文字
  const looksConceptual =
    mustContain.length === 0 ||
    /^（?[1-9]）?\s*[^\d\s]\D{8,}/.test(q.answer.split('\n')[0] ?? '');
  const useLLMJudge = looksConceptual && mustContain.length === 0;
  // 0520 题集首次生成，没人工 rubric — 写一个通用 rubric 让 LLM judge 能跑分。
  // 给定参考答案后让 judge 按"关键事实覆盖 / 准确性 / 完整性"三档打分。
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
    question: q.question,
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
  source: 'test-docs/0520/RAG问题和参考答案-30.docx',
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

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`Wrote ${questions.length} questions to ${OUT_PATH}`);
console.log(`Splits: dev=${dev.length}, holdout=${holdout.length}`);
console.log(`Topics:`, out.topicDistribution);
console.log(
  `Avg must_contain per question: ${(
    questions.reduce((s, q) => s + q.mustContain.length, 0) / questions.length
  ).toFixed(1)}`,
);
