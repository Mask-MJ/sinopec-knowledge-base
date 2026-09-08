/* eslint-disable unicorn/no-nested-ternary , unicorn/no-zero-fractions , @typescript-eslint/no-unnecessary-condition , regexp/no-dupe-disjunctions , regexp/no-unused-capturing-group */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

// 评测打分核心：文本清洗 / 数字与单位归一 / 井号归一 / 检索命中 / 加权事实匹配。
// 所有评分逻辑无副作用、纯函数，便于 spec 测试。

export interface ChunkRef {
  /** 召回段落正文。chunk 级判定要靠它；只比文件名的旧口径可以没有 */
  content?: string;
  documentName: string;
  positions?: number[];
  similarity?: number;
  termSimilarity?: number;
  vectorSimilarity?: number;
}

/**
 * chunk 级召回覆盖度。`applicable === false` 表示这道题无从判定
 * （参考答案里没有数值，或召回结果没带正文），汇总时应排除，不能当 0 计。
 */
export interface RetrievalCoverage {
  applicable: boolean;
  covered: number;
  /** 没被召回的数值原文，直接就是「缺了什么」的诊断线索 */
  missing: string[];
  ratio: number;
  total: number;
}

export interface QuestionRef {
  doc: string;
  section: string;
}

export type Severity = 'critical' | 'supporting';

export interface FactItem {
  context?: string;
  pattern: string;
  severity?: Severity;
  type: 'number' | 'regex' | 'string';
  unit?: string;
}

export interface NotContainItem {
  pattern: string;
  reason?: string;
  type: 'regex' | 'string';
}

export interface RetrievalScore {
  /**
   * 这道题是否有「正确文档」可供召回。
   *
   * 「检索边界」题的参考答案本身就是"知识库里没有这个内容"（0820 题集的
   * Q24 / Q27），`ref.doc` 为空，rank 必然是 0。这类题与"有正确文档却没召回到"
   * 在数值上完全同形，若一并计入 hit@1 / MRR 的分母，等于把"本来就无解"记成
   * "没做到" —— 检索指标会被永久压在封顶值以下，掩盖真实召回表现。
   * 汇总时应只统计 `applicable === true` 的题。
   */
  applicable: boolean;
  hitAt1: 0 | 1;
  hitAt3: 0 | 1;
  hitAtN: 0 | 1;
  matched: boolean;
  mrr: number;
  rank: number;
}

export interface AnswerScore {
  criticalMissing: boolean;
  finalScore: number;
  mustContainHitWeight: number;
  mustContainScore: number;
  mustContainTotalWeight: number;
  mustNotContainHits: number;
  mustNotContainPenalty: number;
}

const UNIT_ALIASES: Record<string, string> = {
  m: 'm',
  米: 'm',
  metre: 'm',
  meter: 'm',
  km: 'km',
  千米: 'km',
  公里: 'km',
  mm: 'mm',
  毫米: 'mm',
  'km²': 'km²',
  km2: 'km²',
  'km^2': 'km²',
  平方千米: 'km²',
  平方公里: 'km²',
  sqkm: 'km²',
  'm²': 'm²',
  m2: 'm²',
  'm^2': 'm²',
  平方米: 'm²',
  'm/s': 'm/s',
  次: '次',
  个: '个',
  束: '束',
  炮: '炮',
  道: '道',
  根: '根',
  站: '站',
  线: '线',
  '°': '°',
  度: '°',
  d: 'd',
  天: 'd',
  年: '年',
  月: '月',
  日: '日',
  '%': '%',
};

export function normalizeUnit(unit: null | string | undefined): string {
  if (!unit) return '';
  const trimmed = unit.trim();
  return (
    UNIT_ALIASES[trimmed] ?? UNIT_ALIASES[trimmed.toLowerCase()] ?? trimmed
  );
}

/**
 * 单位互换组：同组单位视为可互换（领域共识）。
 * 1 = 计数类 (勘探场景：炮/个/次/束/道/根/站/线 互通)
 * 2 = 长度米类
 * 3 = 长度公里类
 * 4 = 面积平方公里
 * 5 = 面积平方米
 * 6 = 百分比
 * 7 = 角度
 * 8 = 速度
 * 9 = 时间
 */
const UNIT_GROUPS: Record<string, number> = {
  炮: 1,
  个: 1,
  // 「接收点总数 236232 个」与「236232 点」在勘探语料里是同一件事
  点: 1,
  次: 1,
  束: 1,
  道: 1,
  根: 1,
  站: 1,
  线: 1,
  m: 2,
  mm: 2,
  km: 3,
  'km²': 4,
  'm²': 5,
  '%': 6,
  '°': 7,
  'm/s': 8,
  d: 9,
  年: 9,
  月: 9,
  日: 9,
};

/**
 * 判断两个单位是否兼容：
 *   - 完全相等 → 兼容
 *   - target 无单位（fact 本就是裸数字）→ 兼容
 *   - target 有单位但 candidate 无单位 → 不兼容（修 Q19/Q26 类裸数字误命中：
 *     "顺8井北" 中的 "8" 不应命中 fact '8m'；"3 条" 中的 "3" 不应命中 fact '3m'）
 *   - 同组 → 兼容（计数 / 长度 / 面积等领域同义单位互通）
 *   - 否则 → 冲突
 */
export function unitsCompatible(target: string, candidate: string): boolean {
  if (target === candidate) return true;
  if (!target) return true;
  if (!candidate) return false;
  const tg = UNIT_GROUPS[target];
  const cg = UNIT_GROUPS[candidate];
  return tg !== undefined && tg === cg;
}

export function parseNumber(s: string): null | number {
  if (!s) return null;
  let t = s.trim();
  t = t.replaceAll(/^[约大概±~≈]+/g, '');
  t = t.replaceAll(/±.*$/g, '');
  t = t.replaceAll(',', '');
  const wan = t.match(/^(-?\d+(?:\.\d*)?)\s*万$/);
  if (wan?.[1]) return Number.parseFloat(wan[1]) * 1e4;
  const yi = t.match(/^(-?\d+(?:\.\d*)?)\s*亿$/);
  if (yi?.[1]) return Number.parseFloat(yi[1]) * 1e8;
  const qian = t.match(/^(-?\d+(?:\.\d*)?)\s*千$/);
  if (qian?.[1]) return Number.parseFloat(qian[1]) * 1e3;
  const num = Number.parseFloat(t);
  return Number.isFinite(num) ? num : null;
}

const NUMBER_EPS = 1e-9;
export function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < NUMBER_EPS;
}

export function normalizeWell(s: string): string {
  return s.replaceAll(/[-\s_]/g, '').toUpperCase();
}

export function normalizeDocName(s: string): string {
  return (
    s
      .replace(/_noimg(?=\.|$)/, '')
      .replace(/\.(docx|pdf|md|txt)$/i, '')
      // 同一份文档导入不同知识库时，文件名里的括号和顿号常被转成下划线
      // （`梁北二井（12采区）` → `梁北二井_12采区_`）。这纯属排版差异，不抹掉的话
      // 检索指标会把命中判成未命中 —— 82 题全量库上一次误判了 15 题。
      // 只去分隔性标点，数字与文字保留，`顺北42` 和 `顺北43` 依旧区分得开。
      .replaceAll(/[\s_\-—()（）[\]【】、,，]/g, '')
      .toLowerCase()
  );
}

export function cleanText(text: string): string {
  return text
    .replaceAll(
      /\[(?:ID:)?\d+(?:\s*,\s*\d+)*\](?:\[(?:ID:)?\d+(?:\s*,\s*\d+)*\])*/g,
      '',
    )
    .replaceAll(/\*\*([^*]+)\*\*/g, '$1')
    .replaceAll(/__([^_]+)__/g, '$1')
    .replaceAll(/[ \t]+/g, ' ')
    .trim();
}

const NUMBER_TOKEN_RE =
  /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([万亿千])?\s*(km²|km2|km\^2|平方千米|平方公里|m²|m2|m\^2|平方米|km|千米|公里|[m米次个点束炮道根站线%°度d天年月日]|metre|meter|mm|毫米|m\/s)?/g;

const MULTIPLIER_MAP: Record<string, number> = {
  万: 1e4,
  亿: 1e8,
  千: 1e3,
};

interface NumberToken {
  index: number;
  num: number;
  raw: string;
  unit: string;
}

export function findNumberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_TOKEN_RE)) {
    if (!m[1]) continue;
    const base = parseNumber(m[1]);
    if (base === null) continue;
    const multKey = m[2];
    const multiplier = multKey ? (MULTIPLIER_MAP[multKey] ?? 1) : 1;
    out.push({
      num: base * multiplier,
      unit: normalizeUnit(m[3] ?? ''),
      raw: m[0],
      index: m.index ?? 0,
    });
  }
  return out;
}

const WELL_TOKEN_RE = /[A-Z]{2,3}[-\s_]*\d+(?:[-\s_]*[JKjk][-\s_]*\d*)?/g;

/** Markdown 表格分隔行，如 `| :--- | ---: |` */
const TABLE_DIVIDER_RE = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;
/** 表头单元格里括号中的单位，如 `数量（个）` / `覆盖次数(次)` */
const HEADER_UNIT_RE = /[(（]\s*([^)）\s]+)\s*[)）]\s*$/;

const splitRow = (line: string): string[] =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|');

/**
 * 把 Markdown 表格中「表头带单位、单元格只剩裸数字」的情况补成「数字+单位」。
 *
 * 规则分要求数字与单位紧邻才算命中，而模型一旦把统计结果排成表格，单位就留在
 * 表头（`数量（个）`）、单元格里只剩 `24` —— 整张表一个都匹配不上，答案明明全对
 * 却被判低分（Q26 实证：0.45，实际应为 0.91）。这是排版导致的系统性低估。
 *
 * 只补「单元格是纯数字」且「该列表头括号里有单位」的格子，不动其它内容，因此不会
 * 放宽正文里的裸数字匹配 —— `顺8井北` 中的 `8` 依旧不会命中 `8m`。
 */
export function inlineTableUnits(text: string): string {
  if (!text.includes('|')) return text;
  const lines = text.split('\n');
  let units: string[] = [];
  let sawDivider = false;

  const out = lines.map((line, i) => {
    if (!line.trimStart().startsWith('|')) {
      units = [];
      sawDivider = false;
      return line;
    }
    if (TABLE_DIVIDER_RE.test(line)) {
      sawDivider = units.length > 0;
      return line;
    }
    // 表头：本行之后若紧跟分隔行，则把各列括号里的单位记下来
    if (units.length === 0 && TABLE_DIVIDER_RE.test(lines[i + 1] ?? '')) {
      units = splitRow(line).map(
        (c) => HEADER_UNIT_RE.exec(c.trim())?.[1] ?? '',
      );
      return line;
    }
    if (!sawDivider) return line;
    const cells = splitRow(line);
    if (!cells.some((c, col) => units[col] && /^\s*\d+(?:\.\d+)?\s*$/.test(c)))
      return line;
    const patched = cells.map((c, col) => {
      const unit = units[col];
      if (!unit || !/^\s*\d+(?:\.\d+)?\s*$/.test(c)) return c;
      return ` ${c.trim()}${unit} `;
    });
    return `|${patched.join('|')}|`;
  });

  return out.join('\n');
}

export function matchesFact(text: string, fact: FactItem): boolean {
  if (fact.type === 'number') {
    const target = parseNumber(fact.pattern);
    if (target === null) return false;
    const targetUnit = normalizeUnit(fact.unit);
    return findNumberTokens(text).some((tk) => {
      if (!numbersEqual(tk.num, target)) return false;
      return unitsCompatible(targetUnit, tk.unit);
    });
  }

  if (fact.type === 'regex') {
    try {
      return new RegExp(fact.pattern).test(text);
    } catch {
      return false;
    }
  }

  if (/^[A-Z]{2,3}\d/.test(fact.pattern) && /J\d/.test(fact.pattern)) {
    const targetWell = normalizeWell(fact.pattern);
    for (const m of text.matchAll(WELL_TOKEN_RE)) {
      if (normalizeWell(m[0]) === targetWell) return true;
    }
    return false;
  }

  // string 匹配：双方都去空格后比较，避免 "1954 北京坐标系" vs "1954北京坐标系" 这种空格差异
  const stripSpaces = (s: string) => s.replaceAll(/\s+/g, '');
  return stripSpaces(text).includes(stripSpaces(fact.pattern));
}

export function matchesNotContain(text: string, item: NotContainItem): boolean {
  if (item.type === 'regex') {
    try {
      return new RegExp(item.pattern).test(text);
    } catch {
      return false;
    }
  }
  return text.includes(item.pattern);
}

export function scoreRetrieval(
  chunks: ChunkRef[],
  ref: QuestionRef,
): RetrievalScore {
  const miss = {
    applicable: true,
    matched: false,
    rank: 0,
    hitAt1: 0,
    hitAt3: 0,
    hitAtN: 0,
    mrr: 0,
  } as const;
  // 没有参考文档 = 无从评判召回，不是召回失败
  if (!ref.doc) return { ...miss, applicable: false };
  if (chunks.length === 0) return { ...miss };
  const refDoc = normalizeDocName(ref.doc);
  let rank = 0;
  for (const [i, chunk] of chunks.entries()) {
    if (!chunk) continue;
    const cand = normalizeDocName(chunk.documentName);
    if (cand.includes(refDoc) || refDoc.includes(cand)) {
      rank = i + 1;
      break;
    }
  }
  if (rank === 0) return { ...miss };
  return {
    applicable: true,
    matched: true,
    rank,
    hitAt1: rank <= 1 ? 1 : 0,
    hitAt3: rank <= 3 ? 1 : 0,
    hitAtN: 1,
    mrr: 1 / rank,
  };
}

/**
 * chunk 级召回判定：参考答案里的数值，有多少个真的出现在召回回来的正文里。
 *
 * `scoreRetrieval` 只比对文件名 —— 一篇文档只要被召回就记 hit@1=1，于是
 * 「文档对了、但需要的那一段根本没排进 top_n」这种失败会被文档级 100% 的
 * 假象整个盖住（Q19 就是：参考的表层结构数值一个都不在召回里，文档级 rank 仍是 1）。
 *
 * 只判数值，不判定性表述。「四级质量检查制度」这类要点的同义判定交给 LLM judge：
 * 在这里做中文分词启发式，等于造一个比被测系统还不可靠的判据。
 */
export function scoreRetrievalCoverage(
  chunks: ChunkRef[],
  answerRaw: string,
): RetrievalCoverage {
  const unjudgeable: RetrievalCoverage = {
    applicable: false,
    covered: 0,
    missing: [],
    ratio: 0,
    total: 0,
  };

  // 参考答案里没有数值 → 无从判定，不该计入分母（同 scoreRetrieval 的 applicable 约定）
  const refTokens = dedupeNumberTokens(findNumberTokens(cleanText(answerRaw)));
  if (refTokens.length === 0) return unjudgeable;

  // 召回结果没带正文（历史结果文件、或只取了文件名）→ 同样无从判定
  const bodies = chunks.map((c) => c?.content ?? '').filter(Boolean);
  if (bodies.length === 0) return unjudgeable;

  const candidates = findNumberTokens(
    inlineTableUnits(cleanText(bodies.join('\n'))),
  );

  const missing: string[] = [];
  let covered = 0;
  for (const want of refTokens) {
    const hit = candidates.some(
      (got) =>
        numbersEqual(got.num, want.num) && unitsCompatible(want.unit, got.unit),
    );
    if (hit) covered += 1;
    else missing.push(want.raw.trim());
  }

  return {
    applicable: true,
    covered,
    missing,
    ratio: covered / refTokens.length,
    total: refTokens.length,
  };
}

/** 同一数值在参考答案里重复出现只算一个要点 */
function dedupeNumberTokens(tokens: NumberToken[]): NumberToken[] {
  const seen = new Set<string>();
  return tokens.filter((t) => {
    const key = `${t.num}|${t.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scoreAnswer(
  rawText: string,
  mustContain: FactItem[],
  mustNotContain: NotContainItem[],
): AnswerScore {
  const text = inlineTableUnits(cleanText(rawText));
  let totalWeight = 0;
  let hitWeight = 0;
  let criticalMissing = false;

  for (const fact of mustContain) {
    const w = fact.severity === 'critical' ? 2 : 1;
    totalWeight += w;
    const hit = matchesFact(text, fact);
    if (hit) hitWeight += w;
    else if (fact.severity === 'critical') criticalMissing = true;
  }

  const mustContainScore = totalWeight > 0 ? hitWeight / totalWeight : 1;

  const ncHits = mustNotContain.filter((it) =>
    matchesNotContain(text, it),
  ).length;
  const penalty = ncHits === 0 ? 0 : ncHits === 1 ? 0.5 : 1.0;

  let base = mustContainScore;
  if (criticalMissing) base = Math.min(base, 0.3);
  const finalScore = Math.max(0, base - penalty);

  return {
    mustContainHitWeight: hitWeight,
    mustContainTotalWeight: totalWeight,
    mustContainScore,
    criticalMissing,
    mustNotContainHits: ncHits,
    mustNotContainPenalty: penalty,
    finalScore,
  };
}
