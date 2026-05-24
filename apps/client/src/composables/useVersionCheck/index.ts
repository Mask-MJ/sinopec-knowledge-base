import { useLeaderTab } from './useLeaderTab';
import { useMidnightRefresh } from './useMidnightRefresh';
import { useVersionPoll } from './useVersionPoll';

/**
 * 应用版本检查 + 自动刷新编排
 *
 * 组合三件事：
 *   1. Leader tab 选举（多 tab 时只选一个 tab 拉 health，避免 N 倍请求）
 *   2. 5 分钟间隔拉 /api/monitor/health，发现后端版本变化时 showUpdateBanner
 *   3. 午夜自动 reload，强制刷掉过夜缓存
 *
 * 在 App.vue setup 中调用一次即可。
 */
export function useVersionCheck() {
  const { isLeader, isPageVisible } = useLeaderTab();
  const { showUpdateBanner, handleRefresh } = useVersionPoll(
    isLeader,
    isPageVisible,
  );
  useMidnightRefresh(isLeader, isPageVisible);

  return {
    handleRefresh,
    showUpdateBanner,
  };
}
