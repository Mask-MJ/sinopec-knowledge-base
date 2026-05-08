// scripts/eval/ 是开发评测工具，按照 ESLint config-protection 钩子要求，
// 不修改 eslint.config.mjs ignores；改用 file-level disable 注释。

// LLM-as-judge 的纯函数打分逻辑。
// 把 RAGFlow API 调用与「跑 N 次、解析、求均值」拆开，便于纯函数 spec 测试。

const DEFAULT_REPLICAS = 3;
const MIN_REPLICAS = 1;
const MAX_REPLICAS = 20;

/**
 * 从环境变量解析 judge 重复次数 N。
 * 非法值（NaN / <1 / >20）回落到默认 3。
 */
export function resolveJudgeReplicas(
  raw: string | undefined,
  fallback: number = DEFAULT_REPLICAS,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < MIN_REPLICAS || n > MAX_REPLICAS) return fallback;
  return n;
}

/**
 * 解析 RAGFlow 返回的原始文本，抽出 0-1 之间的浮点数。
 * 不能解析时返回 null。
 */
export function parseJudgeScore(raw: string): null | number {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const score = Number.parseFloat(m[1]);
  if (Number.isNaN(score)) return null;
  return Math.max(0, Math.min(1, score));
}

/**
 * 对 N 次评分求均值，四舍五入到 2 位小数。
 * - 全部为 null（含空数组）→ 返回 null
 * - 部分 null → 仅对成功的取均值
 */
export function averageScores(scores: (null | number)[]): null | number {
  const valid = scores.filter((s): s is number => s != null);
  if (valid.length === 0) return null;
  const avg = valid.reduce((sum, s) => sum + s, 0) / valid.length;
  return Math.round(avg * 100) / 100;
}

/**
 * 串行跑 N 次 fn，单次失败（throw 或 null）只跳过当次。
 * 返回每次结果（成功为 number，失败为 null），保留长度 = n。
 */
export async function runReplicas(
  n: number,
  fn: (i: number) => Promise<null | number>,
): Promise<(null | number)[]> {
  const out: (null | number)[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const v = await fn(i);
      out.push(v);
    } catch {
      out.push(null);
    }
  }
  return out;
}
