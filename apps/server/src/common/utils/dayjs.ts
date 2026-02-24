import dayjs from 'dayjs';
import durationPlugin from 'dayjs/plugin/duration';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);
dayjs.extend(durationPlugin);

/**
 * UTC 模式的 dayjs 构造器 — 项目标准
 *
 * @example
 * utc()                → 当前 UTC 时间
 * utc('2026-01-01')    → 解析为 UTC
 * utc(someDate)        → Date 转 UTC
 */
export const utc = dayjs.utc;

/**
 * 构建 Prisma WHERE 子句的 UTC 日期范围
 * 自动扩展到完整天边界: start → startOf('day'), end → endOf('day')
 *
 * @example
 * where: { date: utcDateRange(dateRange[0], dateRange[1]) }
 * // → { gte: 2026-01-01T00:00:00Z, lte: 2026-01-31T23:59:59Z }
 */
export function utcDateRange(
  start: Date | string,
  end: Date | string,
): { gte: Date; lte: Date } {
  return {
    gte: dayjs.utc(start).startOf('day').toDate(),
    lte: dayjs.utc(end).endOf('day').toDate(),
  };
}

/**
 * 将秒数格式化为 HH:mm:ss
 */
export function formatDuration(seconds: number): string {
  return dayjs.duration(seconds, 'seconds').format('HH:mm:ss');
}

/**
 * 将 Date 转换为 Unix 时间戳（秒）
 */
export function toUnix(date: Date): number {
  return dayjs(date).unix();
}

export default dayjs;
