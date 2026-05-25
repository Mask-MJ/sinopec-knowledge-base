/**
 * Tab 溢出检测 composable
 *
 * 使用 IntersectionObserver 跟踪哪些 tab 可见，
 * 计算溢出（不可见）的 tab 列表用于下拉菜单。
 */
export function useTabOverflow(
  tabListRef: Ref<HTMLElement | null>,
  tabTrackRef: Ref<HTMLElement | null>,
) {
  const visibleTabKeys = ref(new Set<string>());
  const tabObserver = ref<IntersectionObserver | null>(null);

  function observeAllTabs() {
    const track = tabTrackRef.value;
    const observer = tabObserver.value;
    if (!track || !observer) return;
    observer.disconnect();
    visibleTabKeys.value = new Set();
    track.querySelectorAll('[data-tab-key]').forEach((el) => {
      observer.observe(el);
    });
  }

  onMounted(() => {
    const container = tabListRef.value;
    if (!container) return;
    tabObserver.value = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.tabKey;
          if (!key) continue;
          if (entry.isIntersecting) {
            visibleTabKeys.value.add(key);
          } else {
            visibleTabKeys.value.delete(key);
          }
        }
        visibleTabKeys.value = new Set(visibleTabKeys.value);
      },
      { root: container, threshold: 0.8 },
    );
    observeAllTabs();
  });

  onUnmounted(() => {
    tabObserver.value?.disconnect();
  });

  return {
    visibleTabKeys,
    observeAllTabs,
  };
}
