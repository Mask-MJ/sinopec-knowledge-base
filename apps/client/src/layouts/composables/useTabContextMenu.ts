import type { useTabbarStore } from '@/stores/modules/tabbar';
import type { DropdownOption } from 'naive-ui';
import type { RouteLocationNormalized, Router } from 'vue-router';

/**
 * Tab 右键菜单 composable
 *
 * 管理右键菜单状态、选项生成、和动作分发。
 */
export function useTabContextMenu(options: {
  isAffix: (tab: RouteLocationNormalized) => boolean;
  router: Router;
  t: (key: string) => string;
  tabbarStore: ReturnType<typeof useTabbarStore>;
}) {
  const { tabbarStore, router, t, isAffix } = options;

  const contextMenuVisible = ref(false);
  const contextMenuX = ref(0);
  const contextMenuY = ref(0);
  const contextMenuTab = ref<null | RouteLocationNormalized>(null);

  const contextOptions = computed<DropdownOption[]>(() => {
    const tab = contextMenuTab.value;
    if (!tab) return [];
    const affix = isAffix(tab);
    return [
      { key: 'refresh', label: t('preferences.tabbar.contextMenu.reload') },
      { key: 'd1', type: 'divider' },
      ...(affix
        ? [{ key: 'unpin', label: t('preferences.tabbar.contextMenu.unpin') }]
        : [{ key: 'pin', label: t('preferences.tabbar.contextMenu.pin') }]),
      { key: 'd2', type: 'divider' },
      { key: 'close', label: t('preferences.tabbar.contextMenu.close') },
      {
        key: 'closeLeft',
        label: t('preferences.tabbar.contextMenu.closeLeft'),
      },
      {
        key: 'closeOther',
        label: t('preferences.tabbar.contextMenu.closeOther'),
      },
      {
        key: 'closeRight',
        label: t('preferences.tabbar.contextMenu.closeRight'),
      },
      { key: 'closeAll', label: t('preferences.tabbar.contextMenu.closeAll') },
      { key: 'd3', type: 'divider' },
      {
        key: 'openInNewWindow',
        label: t('preferences.tabbar.contextMenu.openInNewWindow'),
      },
    ];
  });

  const contextActions: Record<string, (tab: RouteLocationNormalized) => void> =
    {
      close: (tab) => void tabbarStore.closeTab(tab, router),
      closeAll: () => void tabbarStore.closeAllTabs(router),
      closeLeft: (tab) => {
        tabbarStore.closeLeftTabs(tab);
      },
      closeOther: (tab) => {
        tabbarStore.closeOtherTabs(tab);
      },
      closeRight: (tab) => {
        tabbarStore.closeRightTabs(tab);
      },
      openInNewWindow: (tab) => {
        tabbarStore.openTabInNewWindow(tab);
      },
      pin: (tab) => {
        tabbarStore.pinTab(tab);
      },
      refresh: () => void tabbarStore.refresh(router),
      unpin: (tab) => {
        tabbarStore.unpinTab(tab);
      },
    };

  function handleContextSelect(key: string) {
    const tab = contextMenuTab.value;
    if (!tab) return;
    const action = contextActions[key];
    if (action) {
      action(tab);
    }
    contextMenuVisible.value = false;
  }

  function handleContextMenu(e: MouseEvent, tab: RouteLocationNormalized) {
    e.preventDefault();
    contextMenuTab.value = tab;
    contextMenuX.value = e.clientX;
    contextMenuY.value = e.clientY;
    contextMenuVisible.value = true;
  }

  function handleClickOutside() {
    contextMenuVisible.value = false;
  }

  return {
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    contextOptions,
    handleContextSelect,
    handleContextMenu,
    handleClickOutside,
  };
}
