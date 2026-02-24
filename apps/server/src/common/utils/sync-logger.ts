/**
 * 同步日志格式化工具
 *
 * 统一所有 sync 模块的完成日志格式，消除各文件手动拼接导致的风格不一致。
 *
 * @example
 * logger.log(formatSyncResult({
 *   prefix: `[${shop.name}]`,
 *   label: '订单同步完成',
 *   result: { created: 120, updated: 30, skipped: 5 },
 *   duration: '2.34',
 * }));
 * // => "[Katch Me UK] 订单同步完成: +120 新增, ~30 更新, 5 跳过, 耗时 2.34s"
 */

export interface SyncResultEntry {
  /** 耗时（秒），已格式化为字符串 */
  duration?: string;
  /** 操作标签，如 `订单同步完成` */
  label: string;
  /** 日志前缀，如 `[Katch Me UK]` 或 `[AdvName]` */
  prefix: string;
  /** 同步结果数据 */
  result: {
    /** 新增条数（shop sync 使用） */
    created?: number;
    /** 失败条数 */
    failed?: number;
    /** 新增条数（report-sync 使用，与 created 互斥） */
    inserted?: number;
    /** 跳过条数 */
    skipped?: number;
    /** 更新条数 */
    updated?: number;
    /** 窗口数（仅 report-sync） */
    windows?: number;
  };
}

/**
 * 格式化同步结果为统一日志字符串
 *
 * 格式规则：
 * - 新增: `+N 新增`（始终显示）
 * - 更新: `~N 更新`（始终显示）
 * - 跳过: `N 跳过`（仅 > 0 时显示）
 * - 失败: `N 失败`（仅 > 0 时显示）
 * - 窗口: `N 个窗口`（仅存在时显示）
 * - 耗时: `耗时 Ns`（仅存在时显示）
 */
export function formatSyncResult(entry: SyncResultEntry): string {
  const { prefix, label, result, duration } = entry;

  const created = result.created ?? result.inserted ?? 0;
  const updated = result.updated ?? 0;

  const parts: string[] = [`+${created} 新增`, `~${updated} 更新`];

  if (result.skipped && result.skipped > 0) {
    parts.push(`${result.skipped} 跳过`);
  }

  if (result.failed && result.failed > 0) {
    parts.push(`${result.failed} 失败`);
  }

  if (result.windows !== undefined) {
    parts.push(`${result.windows} 个窗口`);
  }

  if (duration) {
    parts.push(`耗时 ${duration}s`);
  }

  return `${prefix} ${label}: ${parts.join(', ')}`;
}
