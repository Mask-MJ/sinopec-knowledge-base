import type { Ref } from 'vue';

import { useLocalStorage } from '@vueuse/core';

import { getHealth } from '@/api/monitor/health';

const POLL_INTERVAL = 5 * 60 * 1000;
const VERSION_STORAGE_KEY = 'app_version';

/**
 * Version polling composable.
 *
 * SIDE EFFECTS:
 * - 启动 interval timer 拉 health endpoint
 * - 读写 localStorage 的 `app_version`
 */
export function useVersionPoll(
  isLeader: Readonly<Ref<boolean>>,
  isPageVisible: () => boolean,
) {
  const cachedVersion = useLocalStorage<null | string>(
    VERSION_STORAGE_KEY,
    null,
  );
  const latestVersion = ref<null | string>(null);

  let isChecking = false;
  let pollTimer: null | number = null;

  const showUpdateBanner = computed(() => {
    return Boolean(
      cachedVersion.value &&
      latestVersion.value &&
      cachedVersion.value !== latestVersion.value,
    );
  });

  async function checkVersion() {
    if (isChecking || !isLeader.value || !isPageVisible()) {
      return;
    }

    isChecking = true;

    try {
      const { data } = await getHealth();
      const version = data?.version?.trim();

      if (!version || !isLeader.value || !isPageVisible()) {
        return;
      }

      latestVersion.value = version;

      if (!cachedVersion.value) {
        cachedVersion.value = version;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[VersionCheck] health check failed:', error);
      }
    } finally {
      isChecking = false;
    }
  }

  function handleRefresh() {
    cachedVersion.value = latestVersion.value || null;
    window.location.reload();
  }

  function startPoll() {
    if (!pollTimer) {
      pollTimer = window.setInterval(() => {
        void checkVersion();
      }, POLL_INTERVAL);
    }
  }

  function stopPoll() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  watch(
    isLeader,
    (leader) => {
      if (leader) {
        void checkVersion();
        startPoll();
      } else {
        stopPoll();
      }
    },
    { immediate: true },
  );

  onMounted(() => {
    if (isLeader.value) {
      void checkVersion();
      startPoll();
    }
  });

  onBeforeUnmount(() => {
    stopPoll();
  });

  return {
    handleRefresh,
    showUpdateBanner,
  };
}
