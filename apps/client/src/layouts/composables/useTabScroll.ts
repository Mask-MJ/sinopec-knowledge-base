/**
 * Tab 滚动控制 composable
 *
 * 管理滚动箭头指示器、滚动到中心、滚动方向控制、ResizeObserver。
 */
export function useTabScroll(
  tabListRef: Ref<HTMLElement | null>,
  tabPositions: ComputedRef<Map<string, { left: number; width: number }>>,
) {
  const showLeftArrow = ref(false);
  const showRightArrow = ref(false);
  const hasOverflow = ref(false);

  function updateScrollIndicators() {
    const container = tabListRef.value;
    if (!container) return;
    showLeftArrow.value = container.scrollLeft > 0;
    showRightArrow.value =
      container.scrollLeft + container.clientWidth < container.scrollWidth - 1;
    hasOverflow.value = container.scrollWidth > container.clientWidth;
  }

  function scrollTo(direction: 'left' | 'right') {
    const container = tabListRef.value;
    if (!container) return;
    const distance = container.clientWidth * 0.6;
    container.scrollBy({
      behavior: 'smooth',
      left: direction === 'left' ? -distance : distance,
    });
    setTimeout(updateScrollIndicators, 350);
  }

  function scrollActiveTabToCenter(activeKey: string) {
    const container = tabListRef.value;
    if (!container) return;
    const pos = tabPositions.value.get(activeKey);
    if (!pos) return;
    const containerWidth = container.clientWidth;
    const targetScroll = pos.left - containerWidth / 2 + pos.width / 2;
    container.scrollTo({ behavior: 'smooth', left: targetScroll });
    setTimeout(updateScrollIndicators, 350);
  }

  // observer 在外层声明，让 onUnmounted 与 onMounted 平级配对（之前
  // 在 onMounted 内嵌套注册 onUnmounted 技术上 OK 但反模式 — 闭包让"何
  // 时清理"的意图变得隐晦）。
  let resizeObserver: null | ResizeObserver = null;

  onMounted(() => {
    updateScrollIndicators();
    const container = tabListRef.value;
    if (container) {
      resizeObserver = new ResizeObserver(updateScrollIndicators);
      resizeObserver.observe(container);
    }
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return {
    showLeftArrow,
    showRightArrow,
    hasOverflow,
    updateScrollIndicators,
    scrollTo,
    scrollActiveTabToCenter,
  };
}
