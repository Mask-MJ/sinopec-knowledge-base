/* eslint-disable unicorn/prefer-module , unicorn/prefer-string-slice , no-cond-assign , no-console , regexp/no-dupe-disjunctions , regexp/no-obscure-range */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOCX_PATH = resolve(
  __dirname,
  '../../../../test-docs/0420/RAG问题和参考答案.docx',
);
const OUT_DIR = resolve(__dirname, 'dataset');
const OUT_PATH = resolve(OUT_DIR, 'questions.json');

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

function parseExplanation(exp: string): { doc: string; section: string } {
  const docMatch = exp.match(/[“"]([^“”"\n]+)[”"]/);
  const doc = docMatch?.[1] ?? '';
  let section = exp;
  if (doc) {
    section = exp
      .replaceAll(/参考文档[:：]?/g, '')
      .replace(`"${doc}"`, '')
      .replace(`“${doc}”`, '')
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

type Topic = 'other' | 'shale' | 'shunbei21' | 'shunbei42' | 'shunbei43';

function classifyTopic(answer: string, question: string): Topic {
  const text = `${answer} ${question}`;
  if (text.includes('43井') || /顺北\s*43/.test(text)) return 'shunbei43';
  if (text.includes('42井') || /顺北\s*42/.test(text)) return 'shunbei42';
  if (text.includes('21井') || /顺北\s*21/.test(text)) return 'shunbei21';
  if (text.includes('页岩气') || text.includes('彭水')) return 'shale';
  return 'other';
}

const questions = raw.map((q) => {
  const ref = parseExplanation(q.explanation);
  const topic = classifyTopic(q.answer, q.question);
  const mustContain = autoMustContain(q.answer);
  // 概念题启发式：mustContain 抽不出 || 答案以"（1）/（2）/...."等分点开头但全是文字
  const looksConceptual =
    mustContain.length === 0 ||
    /^（?[1-9]）?\s*[^\d\s]\D{8,}/.test(q.answer.split('\n')[0] ?? '');
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
    useLLMJudge: looksConceptual && mustContain.length === 0,
    llmJudgeRubric: '' as string,
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
  source: 'test-docs/0420/RAG问题和参考答案.docx',
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
