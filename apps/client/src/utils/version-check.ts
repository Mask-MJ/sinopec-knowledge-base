/**
 * 版本检查纯工具函数集（无副作用，可单测）
 *
 * 设计：把 leader lease 校验、日期 stamp、距离午夜的毫秒数等纯逻辑从
 * composable 里拆出，方便在不挂载 Vue 的情况下单测，也方便 SSR 复用。
 */

export interface VersionCheckLeaderLease {
  expiresAt: number;
  ownerId: string;
}

/** 把日期格式化为本地 YYYY-MM-DD，用于跨天检测 */
export function getLocalDayStamp(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** 距离下一个本地午夜（00:00:00.000）还有多少毫秒，下界 0 */
export function getMillisecondsUntilNextMidnight(date: Date = new Date()) {
  const nextMidnight = new Date(date);

  nextMidnight.setHours(24, 0, 0, 0);

  return Math.max(0, nextMidnight.getTime() - date.getTime());
}

/** lease 是否仍在有效期内（无论是谁持有） */
export function isLeaderLeaseActive(
  lease: null | VersionCheckLeaderLease,
  now: number = Date.now(),
) {
  return Boolean(lease && lease.expiresAt > now);
}

/** 当前 tab 是否仍是 lease 的合法持有者 */
export function isLeaderLeaseOwner(
  lease: null | VersionCheckLeaderLease,
  ownerId: string,
  now: number = Date.now(),
) {
  return Boolean(lease && lease.ownerId === ownerId && lease.expiresAt > now);
}
