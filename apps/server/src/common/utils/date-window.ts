/**
 * 日期窗口切分工具
 *
 * 将日期范围按固定天数切分为多个窗口，供各同步模块复用。
 * shop 模块和 advertiser 模块共享此基础能力。
 */

import type { Dayjs } from 'dayjs';

import dayjs, { utc } from '@/common/utils/dayjs';

/**
 * 字符串格式的日期窗口（YYYY-MM-DD）
 */
export interface DateWindow {
  endDate: string;
  startDate: string;
}

/**
 * 将日期范围切分为固定大小的时间窗口
 *
 * @param start  起始时间
 * @param end    结束时间
 * @param windowDays 窗口大小（天）
 * @returns 时间窗口数组 [[start1, end1], [start2, end2], ...]
 */
export function splitDateRange(
  start: Date,
  end: Date,
  windowDays: number,
): Array<[Date, Date]> {
  const slices: Array<[Date, Date]> = [];
  let current = utc(start);
  const endDayjs = utc(end);

  while (current.isBefore(endDayjs)) {
    const sliceEnd = current.add(windowDays, 'day');
    const actualEnd = sliceEnd.isAfter(endDayjs) ? endDayjs : sliceEnd;
    slices.push([current.toDate(), actualEnd.toDate()]);
    current = actualEnd;
  }

  return slices;
}

/**
 * 生成日期窗口列表（字符串格式）
 *
 * 从昨天往前回溯 totalDays 天，按 windowDays 天一段切割。
 * 结果按时间从早到晚排列，最后一段 clamp 到昨天。
 *
 * @example
 * // 假设今天是 2026-02-12
 * generateDateWindows(90, 30)
 * // => [
 * //   { startDate: '2025-11-14', endDate: '2025-12-13' },
 * //   { startDate: '2025-12-14', endDate: '2026-01-12' },
 * //   { startDate: '2026-01-13', endDate: '2026-02-11' },
 * // ]
 */
export function generateDateWindows(
  totalDays = 730,
  windowDays = 30,
): DateWindow[] {
  const yesterday = dayjs().subtract(1, 'day');
  const startDay = yesterday.subtract(totalDays - 1, 'day');

  const windows: DateWindow[] = [];
  let cursor: Dayjs = startDay;

  while (cursor.isBefore(yesterday) || cursor.isSame(yesterday, 'day')) {
    const windowEnd = cursor.add(windowDays - 1, 'day');
    const clampedEnd = windowEnd.isAfter(yesterday) ? yesterday : windowEnd;

    windows.push({
      startDate: cursor.format('YYYY-MM-DD'),
      endDate: clampedEnd.format('YYYY-MM-DD'),
    });

    cursor = clampedEnd.add(1, 'day');
  }

  return windows;
}
