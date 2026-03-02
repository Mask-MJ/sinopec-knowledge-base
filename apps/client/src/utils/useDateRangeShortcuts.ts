import type { DatePickerProps } from 'naive-ui';

import dayjs from 'dayjs';

import { $t } from '@/locales';

/**
 * 日期范围快捷选项 composable
 * 提供统一的日期快捷选项配置，避免代码冗余
 *
 * @param disableDays - 禁用最近 N 天（如 T-2 则传 2），默认为 0（不禁用）
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { getDateDisabledFn, useDateRangeShortcuts } from '@/utils/useDateRangeShortcuts'
 *
 * const dateShortcuts = useDateRangeShortcuts(2) // T-2 禁用
 * const isDateDisabled = getDateDisabledFn(2)
 * </script>
 *
 * <template>
 *   <n-date-picker :shortcuts="dateShortcuts" :is-date-disabled="isDateDisabled" type="daterange" />
 * </template>
 * ```
 */
export function useDateRangeShortcuts(
  disableDays = 0,
): DatePickerProps['shortcuts'] {
  /** 获取允许的最大日期（每次调用时实时计算，避免跨天过时） */
  const getMaxDate = () =>
    disableDays > 0 ? dayjs().subtract(disableDays, 'day') : dayjs();

  return {
    // 仅在 disableDays <= 0 时保留"今天"
    ...(disableDays <= 0 && {
      [$t('page.erp.shop.today')]: () => [
        dayjs().startOf('day').valueOf(),
        dayjs().endOf('day').valueOf(),
      ],
    }),
    // 仅在 disableDays <= 1 时保留"昨天"
    ...(disableDays <= 1 && {
      [$t('page.erp.shop.yesterday')]: () => [
        dayjs().subtract(1, 'day').startOf('day').valueOf(),
        dayjs().subtract(1, 'day').endOf('day').valueOf(),
      ],
    }),
    [$t('page.erp.shop.last7Days')]: () => [
      dayjs().subtract(6, 'day').startOf('day').valueOf(),
      getMaxDate().endOf('day').valueOf(),
    ],
    [$t('page.erp.shop.last30Days')]: () => [
      dayjs().subtract(29, 'day').startOf('day').valueOf(),
      getMaxDate().endOf('day').valueOf(),
    ],
    [$t('page.erp.shop.thisMonth')]: () => [
      dayjs().startOf('month').valueOf(),
      getMaxDate().endOf('day').valueOf(),
    ],
    [$t('page.erp.shop.lastMonth')]: () => [
      dayjs().subtract(1, 'month').startOf('month').valueOf(),
      dayjs().subtract(1, 'month').endOf('month').valueOf(),
    ],
  };
}

/**
 * 生成日期禁用函数，用于 n-date-picker 的 is-date-disabled 属性
 * 禁用 T-0 到 T-(disableDays-1) 范围内的日期
 *
 * @param disableDays - 禁用最近 N 天
 */
export function getDateDisabledFn(disableDays: number) {
  return (ts: number) =>
    dayjs(ts).isAfter(dayjs().subtract(disableDays, 'day').endOf('day'));
}
