/**
 * 数据解析工具
 *
 * 提供统一的字符串→类型安全值转换函数（Number / Decimal / Date）。
 * 外部 API 返回的指标值通常为字符串，此模块将其标准化为数据库可接受的类型。
 */

import { Prisma } from '@prisma/generated/client';

/**
 * 安全解析整数/浮点数
 *
 * 空值返回 0 而非 undefined，因为 bulkUpsert 使用 raw SQL 绕过 Prisma @default(0)。
 */
export function parseNumber(value: null | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number.parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * 安全解析 Decimal（用于财务等需要精确小数的场景）
 */
export function parseDecimal(
  value: null | string | undefined,
): Prisma.Decimal | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

/**
 * 解析日期字符串，仅保留日期部分
 *
 * 兼容 "YYYY-MM-DD" 和 "YYYY-MM-DD HH:mm:ss" 格式。
 */
export function parseDate(
  dateString: null | string | undefined,
): Date | undefined {
  if (dateString === undefined || dateString === null || dateString === '')
    return undefined;
  const datePart = dateString.split(' ')[0];
  if (!datePart) return undefined;
  return new Date(datePart);
}
