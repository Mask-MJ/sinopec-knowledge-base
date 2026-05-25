import type { useTabbarStore } from '@/stores/modules/tabbar';
import type { RouteLocationNormalized } from 'vue-router';

/**
 * Tab 拖拽排序 composable
 *
 * 管理拖拽状态、虚拟排序和 affix 边界保护。
 * 不直接修改 store 顺序，仅在 dragEnd 时提交。
 */
export function useTabDragSort(options: {
  defaultTabWidth: number;
  draggableEnabled: ComputedRef<boolean>;
  tabbarStore: ReturnType<typeof useTabbarStore>;
  tabGap: number;
  tabListRef: Ref<HTMLElement | null>;
  tabPositions: ComputedRef<Map<string, { left: number; width: number }>>;
  tabTrackRef: Ref<HTMLElement | null>;
  tabWidths: Ref<Map<string, number>>;
  totalTrackWidth: ComputedRef<number>;
}) {
  const {
    tabbarStore,
    tabPositions,
    tabWidths,
    totalTrackWidth,
    tabTrackRef,
    tabListRef,
    draggableEnabled,
    defaultTabWidth,
    tabGap,
  } = options;

  const dragState = reactive({
    dragging: false,
    dragKey: '' as string,
    originIndex: -1,
    targetIndex: -1,
    offsetInTab: 0,
    currentLeft: 0,
  });

  /** 拖拽时的虚拟排序：不修改 store，只计算虚拟顺序 */
  function getVirtualOrder() {
    const tabs = tabbarStore.getTabs;
    if (!dragState.dragging || dragState.targetIndex < 0) return tabs;

    const dragIdx = tabs.findIndex(
      (t) => tabbarStore.getTabKey(t) === dragState.dragKey,
    );
    if (dragIdx === -1) return tabs;

    const virtualOrder = [...tabs];
    const [removed] = virtualOrder.splice(dragIdx, 1);
    if (!removed) return tabs;
    virtualOrder.splice(dragState.targetIndex, 0, removed);
    return virtualOrder;
  }

  function handleDragStart(e: MouseEvent, tab: RouteLocationNormalized) {
    if (e.button !== 0) return;
    if (!draggableEnabled.value) return;

    const key = tabbarStore.getTabKey(tab);
    const tabs = tabbarStore.getTabs;
    const index = tabs.findIndex((t) => tabbarStore.getTabKey(t) === key);
    if (index === -1) return;

    const track = tabTrackRef.value;
    if (!track) return;

    const tabEl = track.querySelector(`[data-tab-key="${key}"]`) as HTMLElement;
    if (!tabEl) return;

    const trackRect = track.getBoundingClientRect();
    const scrollContainer = tabListRef.value;
    const scrollLeft = scrollContainer?.scrollLeft || 0;

    const mouseTrackX = e.clientX - trackRect.left + scrollLeft;
    const pos = tabPositions.value.get(key);
    const tabLeft = pos?.left ?? 0;

    dragState.dragging = true;
    dragState.dragKey = key;
    dragState.originIndex = index;
    dragState.targetIndex = index;
    dragState.offsetInTab = mouseTrackX - tabLeft;
    dragState.currentLeft = tabLeft;

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    e.preventDefault();
  }

  function handleDragMove(e: MouseEvent) {
    if (!dragState.dragging) return;

    const track = tabTrackRef.value;
    const scrollContainer = tabListRef.value;
    if (!track || !scrollContainer) return;

    const trackRect = track.getBoundingClientRect();
    const scrollLeft = scrollContainer.scrollLeft;
    const mouseTrackX = e.clientX - trackRect.left + scrollLeft;
    const newLeft = mouseTrackX - dragState.offsetInTab;

    const dragWidth = tabWidths.value.get(dragState.dragKey) || defaultTabWidth;
    dragState.currentLeft = Math.max(
      0,
      Math.min(newLeft, totalTrackWidth.value - dragWidth),
    );

    // 在不含被拖拽 tab 的排列中，找到 dragCenter 应插入的位置
    const dragCenter = dragState.currentLeft + dragWidth / 2;
    const tabs = tabbarStore.getTabs;

    let accLeft = 0;
    let insertIndex = 0;
    let found = false;
    for (const tab of tabs) {
      const key = tabbarStore.getTabKey(tab);
      if (key === dragState.dragKey) continue;
      const w = tabWidths.value.get(key) || defaultTabWidth;
      const center = accLeft + w / 2;
      if (!found && dragCenter <= center) {
        found = true;
      }
      if (!found) {
        insertIndex++;
      }
      accLeft += w + tabGap;
    }
    if (!found) {
      insertIndex = tabs.length - 1;
    }

    dragState.targetIndex = insertIndex;

    // 自动滚动
    const containerRect = scrollContainer.getBoundingClientRect();
    const edgeZone = 40;
    if (e.clientX < containerRect.left + edgeZone) {
      scrollContainer.scrollLeft -= 5;
    } else if (e.clientX > containerRect.right - edgeZone) {
      scrollContainer.scrollLeft += 5;
    }
  }

  function handleDragEnd() {
    if (dragState.dragging) {
      const tabs = tabbarStore.getTabs;
      const currentIdx = tabs.findIndex(
        (t) => tabbarStore.getTabKey(t) === dragState.dragKey,
      );
      let targetIdx = dragState.targetIndex;

      // affix 边界保护
      const affixCount = tabs.filter((t) => t.meta?.affixTab).length;
      const isDraggedAffix = tabs[currentIdx]?.meta?.affixTab;
      if (!isDraggedAffix && affixCount > 0) {
        targetIdx = Math.max(affixCount, targetIdx);
      } else if (isDraggedAffix && affixCount > 0) {
        targetIdx = Math.min(affixCount - 1, targetIdx);
      }

      if (currentIdx !== -1 && targetIdx !== currentIdx) {
        tabbarStore.sortTabs(currentIdx, targetIdx);
      }
    }

    dragState.dragging = false;
    dragState.dragKey = '';
    dragState.originIndex = -1;
    dragState.targetIndex = -1;

    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  }

  // 防止拖拽中途组件被销毁（例如 tabbar 被动态隐藏）时 document 监听器
  // 永久泄漏；handleDragEnd 重复 removeEventListener 是幂等操作，安全。
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  });

  return {
    dragState,
    getVirtualOrder,
    handleDragStart,
    handleDragEnd,
  };
}
