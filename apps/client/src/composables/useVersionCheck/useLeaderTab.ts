import type { VersionCheckLeaderLease } from '@/utils/version-check';

import { StorageSerializers, useStorage } from '@vueuse/core';

import { isLeaderLeaseActive, isLeaderLeaseOwner } from '@/utils/version-check';

const LEADER_HEARTBEAT_INTERVAL = 15 * 1000;
const LEADER_LEASE_MS = 45 * 1000;
const LEADER_STORAGE_KEY = 'app_version_check_leader';

/**
 * Leader tab election composable.
 *
 * SIDE EFFECTS:
 * - 注册 `visibilitychange` 监听器到 `document`
 * - 注册 `storage` 监听器到 `window`
 * - 心跳 interval 续约 leadership
 *
 * NOTE: Leader 选举是 best-effort —— 读 → 校验 → 写 localStorage 不原子，
 * 两个 tab 同时观察到过期 lease 时可能各自声明 leader。对版本检查场景这
 * 可接受，最坏后果是多发一次 health 请求。
 */
export function useLeaderTab() {
  const leaderLease = useStorage<null | VersionCheckLeaderLease>(
    LEADER_STORAGE_KEY,
    null,
    localStorage,
    { serializer: StorageSerializers.object },
  );
  const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const _isLeader = ref(false);

  let heartbeatTimer: null | number = null;

  function isPageVisible() {
    return document.visibilityState === 'visible';
  }

  function hasLeadership(now: number = Date.now()) {
    return isLeaderLeaseOwner(leaderLease.value, tabId, now);
  }

  function acquireOrRenewLeadership(now: number = Date.now()) {
    if (!isPageVisible()) {
      _isLeader.value = false;
      return false;
    }

    if (hasLeadership(now) || !isLeaderLeaseActive(leaderLease.value, now)) {
      leaderLease.value = {
        expiresAt: now + LEADER_LEASE_MS,
        ownerId: tabId,
      };
      _isLeader.value = true;
      return true;
    }

    _isLeader.value = false;
    return false;
  }

  function releaseLeadership() {
    if (leaderLease.value?.ownerId === tabId) {
      leaderLease.value = null;
    }
    _isLeader.value = false;
  }

  function syncLeadership() {
    return acquireOrRenewLeadership();
  }

  function startHeartbeat() {
    if (!heartbeatTimer) {
      heartbeatTimer = window.setInterval(() => {
        syncLeadership();
      }, LEADER_HEARTBEAT_INTERVAL);
    }
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function handleVisibilityChange() {
    if (isPageVisible()) {
      startHeartbeat();
      syncLeadership();
    } else {
      stopHeartbeat();
      releaseLeadership();
    }
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== LEADER_STORAGE_KEY || !isPageVisible()) {
      return;
    }
    syncLeadership();
  }

  onMounted(() => {
    if (isPageVisible()) {
      acquireOrRenewLeadership();
      startHeartbeat();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('storage', handleStorage);
    stopHeartbeat();
    releaseLeadership();
  });

  return {
    isLeader: readonly(_isLeader),
    isPageVisible,
  };
}
