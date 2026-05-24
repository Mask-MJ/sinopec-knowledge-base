/**
 * 最新请求守卫：异步加载场景下避免旧请求覆盖新请求结果。
 *
 * 典型场景：
 * - 抽屉/弹窗打开 → 切换记录 → 切换前的请求晚到，把新记录的数据覆盖掉
 * - 列表筛选条件变更 → 旧筛选的请求晚到，结果错配
 * - 轮询 / 长任务，多个独立 service 调用需共享同一作废 generation
 *
 * 用法：
 *   const guard = createLatestRequestGuard();
 *   async function loadDetail(id: string) {
 *     const requestId = guard.next();
 *     const data = await fetchDetail(id);
 *     if (!guard.isLatest(requestId)) return; // 旧请求，丢弃
 *     // ... 写回 state
 *   }
 *
 * 抽屉/弹窗关闭时调用 `guard.invalidate()` 直接作废所有正在跑的请求。
 */
export function createLatestRequestGuard() {
  let currentRequestId = 0;

  return {
    /**
     * 读取最近一次 next() 返回的 id（不递增）；
     * 用于不开启新版本但仍想被新 next/invalidate 作废的场景
     * （如 polling 复用上一轮版本号）
     */
    current() {
      return currentRequestId;
    },
    /** 判断 requestId 是否仍是最新（未被后续 next/invalidate 覆盖） */
    isLatest(requestId: number) {
      return requestId === currentRequestId;
    },
    /**
     * 递增版本号，使此前 next() 派发的请求结果都被丢弃
     * （请求本身不会被取消）
     */
    invalidate() {
      currentRequestId += 1;
    },
    /** 启动一次新请求，返回 id；后续用 isLatest(id) 判断是否仍然有效 */
    next() {
      currentRequestId += 1;
      return currentRequestId;
    },
  };
}

export type LatestRequestGuard = ReturnType<typeof createLatestRequestGuard>;
