/**
 * 数值 / 货币 / 文本 / 布尔类格式化工具集。
 *
 * 命名约定：本文件统一以 `fmt` 前缀（fmtNumber / fmtRatio / fmtPercent /
 * fmtDecimal2 / fmtCurrency / fmtText / fmtList / fmtBool）。时间类格式化在
 * `utils/date.ts`，以 `format` 前缀（formatDate / formatDateTime 等）。
 * 两套前缀按"金额/数值 vs 时间"划分语义域，刻意不统一，避免调用点凭前缀
 * 难以分辨返回值是数值字符串还是时间字符串；同文件内禁止混用。
 */

import { formatCurrency } from '@/utils/currency';

/**
 * 可格式化的数值类型。
 * 运行时 Decimal2 字段（OpenAPI schema 里形如 Record<string, never>）实际为
 * string，这里用 `string | number | null | undefined` 覆盖常见传入，无需回耦
 * openapi 类型。
 */
export type Formattable = null | number | string | undefined;

// ==================== 数值 ====================

/** 千分位整数，无货币符号 */
export const fmtNumber = (val: Formattable): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

/** 倍数 / 频次 / 时长 — 保留 2 位小数 */
export const fmtRatio = (val: Formattable): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** 百分比 — 保留 2 位小数 + % 后缀 */
export const fmtPercent = (val: Formattable): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return `${num.toFixed(2)}%`;
};

/**
 * 占比百分比 — 自适应精度。
 *
 * 入参语义为"占比"小数（0..1），如 0.0365 → 3.65%。
 * 默认 1 位小数；当 round 后为 0 但原值 > 0 时逐级升精度，最高到 maxDecimals。
 * 若超过最大精度仍 round 为 0，返回 `< 0.{maxDecimals 位}%`，避免假"0.0%"。
 */
export const fmtSharePercent = (
  share: Formattable,
  maxDecimals = 4,
): string => {
  const safeMax = Math.max(1, maxDecimals);
  const num = Number(share);
  if (Number.isNaN(num) || num <= 0) return '0%';
  const pct = num * 100;
  for (let d = 1; d <= safeMax; d++) {
    const formatted = pct.toFixed(d);
    if (Number.parseFloat(formatted) > 0) return `${formatted}%`;
  }
  return `< 0.${'0'.repeat(safeMax - 1)}1%`;
};

/** Decimal2 字段格式化（运行时为 string） */
export const fmtDecimal2 = (val: Formattable, digits = 2): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/**
 * 紧凑数字格式化：1234 → 1.23K；1.5e9 → 1.5B；1.5e12 → 1.5T。
 * 用于空间紧凑的卡片 / 图表中心 / tooltip 等场景。不含货币符号。
 */
export const fmtCompact = (val: Formattable, digits = 2): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: digits,
  }).format(num);
};

/**
 * 货币金额格式化，代理 utils/currency.formatCurrency
 *
 * 入参接受 `unknown` 以兼容 OpenAPI-typescript 生成的 Decimal2 字段
 * （运行时 number | string，schema 类型为 `Record<string, never>`）。
 */
export const fmtCurrency = (val: unknown, currency?: null | string): string => {
  const num = Number(val);
  if (Number.isNaN(num)) return '-';
  return formatCurrency(num, currency || 'USD');
};

// ==================== 文本 / 时间 / 布尔 ====================

export const fmtText = (value: null | string | undefined) =>
  value === null || value === undefined || value === '' ? '-' : value;

export const fmtList = (value: null | string[] | undefined) =>
  !Array.isArray(value) || value.length === 0 ? '-' : value.join(', ');

export const fmtBool = (value: boolean | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value ? '✓' : '✗';
};
