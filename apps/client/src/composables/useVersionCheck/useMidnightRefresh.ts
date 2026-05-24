import type { Ref } from 'vue';

import { useLocalStorage } from '@vueuse/core';

import {
  getLocalDayStamp,
  getMillisecondsUntilNextMidnight,
} from '@/utils/version-check';

const VERSION_STORAGE_KEY = 'app_version';

/**
 * 午夜自动刷新 composable
 *
 * SIDE EFFECTS:
 * - 在本地午夜调度一次 reload
 * - reload 前清空 `app_version` 缓存
 * - 长挂跨天后再次可见时立即刷新
 */
export function useMidnightRefresh(
  isLeader: Readonly<Ref<boolean>>,
  isPageVisible: () => boolean,
) {
  const cachedVersion = useLocalStorage<null | string>(
    VERSION_STORAGE_KEY,
    null,
  );

  let lastVisibleDay = getLocalDayStamp(new Date());
  let midnightTimer: null | number = null;

  function handleAutoRefresh() {
    cachedVersion.value = null;
    window.location.reload();
  }

  function clearMidnightTimer() {
    if (midnightTimer) {
      window.clearTimeout(midnightTimer);
      midnightTimer = null;
    }
  }

  function scheduleMidnightRefresh() {
    clearMidnightTimer();

    if (!isLeader.value || !isPageVisible()) {
      return;
    }

    midnightTimer = window.setTimeout(() => {
      if (isLeader.value) {
        handleAutoRefresh();
      }
    }, getMillisecondsUntilNextMidnight(new Date()));
  }

  function checkCrossDay() {
    const currentDay = getLocalDayStamp(new Date());
    const crossedDay = currentDay !== lastVisibleDay;
    lastVisibleDay = currentDay;

    if (crossedDay && isLeader.value) {
      handleAutoRefresh();
      return true;
    }

    return false;
  }

  watch(
    isLeader,
    (leader) => {
      if (leader) {
        if (!checkCrossDay()) {
          scheduleMidnightRefresh();
        }
      } else {
        clearMidnightTimer();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearMidnightTimer();
  });

  return {
    checkCrossDay,
  };
}
