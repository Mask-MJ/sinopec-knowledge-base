<script setup lang="ts">
import type { RouteLocationNormalized } from 'vue-router';

import { useI18n } from 'vue-i18n';

import { isPathMatch } from '@/utils/isPathMatch';

import { useTabContextMenu } from '../composables/useTabContextMenu';
import { useTabDragSort } from '../composables/useTabDragSort';
import { useTabOverflow } from '../composables/useTabOverflow';
import { useTabScroll } from '../composables/useTabScroll';

const router = useRouter();
const route = useRoute();
const tabbarStore = useTabbarStore();
const preferencesStore = usePreferencesStore();
const userStore = useUserStore();
const { t } = useI18n();

const tabbarPrefs = computed(() => preferencesStore.state.tabbar);

// ============ 常量 & DOM refs ============

const TAB_GAP = 6;
const CONTAINER_HEIGHT = 40;
const DEFAULT_TAB_WIDTH = 80;

const tabListRef = ref<HTMLElement | null>(null);
const tabTrackRef = ref<HTMLElement | null>(null);
const tabWidths = ref<Map<string, number>>(new Map());

function measureTabWidths() {
  const track = tabTrackRef.value;
  if (!track) return;
  const elements = track.querySelectorAll<HTMLElement>('[data-tab-key]');
  const newWidths = new Map<string, number>();
  for (const el of elements) {
    const key = el.dataset.tabKey;
    if (key) {
      newWidths.set(key, el.offsetWidth);
    }
  }
  tabWidths.value = newWidths;
}

// ============ Tab 位置计算（依赖拖拽虚拟排序） ============

const { dragState, getVirtualOrder, handleDragStart } = useTabDragSort({
  tabbarStore,
  tabPositions: computed(() => tabPositions.value),
  tabWidths,
  totalTrackWidth: computed(() => totalTrackWidth.value),
  tabTrackRef,
  tabListRef,
  draggableEnabled: computed(() => tabbarPrefs.value.draggable),
  defaultTabWidth: DEFAULT_TAB_WIDTH,
  tabGap: TAB_GAP,
});

const tabPositions = computed(() => {
  const tabs = getVirtualOrder();
  const positions = new Map<string, { left: number; width: number }>();
  let left = 0;

  for (const tab of tabs) {
    const key = tabbarStore.getTabKey(tab);
    const width = tabWidths.value.get(key) || DEFAULT_TAB_WIDTH;
    positions.set(key, { left, width });
    left += width + TAB_GAP;
  }

  return positions;
});

const totalTrackWidth = computed(() => {
  const tabs = tabbarStore.getTabs;
  let total = 0;
  for (const tab of tabs) {
    const key = tabbarStore.getTabKey(tab);
    total += tabWidths.value.get(key) || DEFAULT_TAB_WIDTH;
  }
  total += Math.max(0, tabs.length - 1) * TAB_GAP;
  return total;
});

function getTabStyle(tab: RouteLocationNormalized): Record<string, string> {
  const key = tabbarStore.getTabKey(tab);
  const pos = tabPositions.value.get(key);
  const isDragging = dragState.dragging && dragState.dragKey === key;

  if (isDragging) {
    return {
      position: 'absolute',
      top: '50%',
      transform: 'translate(0, -50%)',
      left: `${dragState.currentLeft}px`,
      zIndex: '10',
      transition: 'none',
      cursor: 'grabbing',
    };
  }

  return {
    position: 'absolute',
    top: '50%',
    transform: 'translate(0, -50%)',
    left: `${pos?.left ?? 0}px`,
    transition: dragState.dragging
      ? 'left 250ms cubic-bezier(0.25, 1, 0.5, 1)'
      : 'left 200ms ease',
  };
}

// ============ 滚动控制 ============

const {
  showLeftArrow,
  showRightArrow,
  hasOverflow,
  updateScrollIndicators,
  scrollTo,
  scrollActiveTabToCenter,
} = useTabScroll(tabListRef, tabPositions);

// ============ 溢出检测 ============

const { visibleTabKeys, observeAllTabs } = useTabOverflow(
  tabListRef,
  tabTrackRef,
);

const overflowTabs = computed(() => {
  if (!hasOverflow.value) return [];
  return tabbarStore.getTabs
    .filter((tab) => !visibleTabKeys.value.has(tabbarStore.getTabKey(tab)))
    .map((tab) => ({
      key: tabbarStore.getTabKey(tab),
      label: getTabTitle(tab),
      props: {
        onClick: () => handleTabClick(tab),
      },
    }));
});

// ============ 宽度测量生命周期 ============

const positioningReady = ref(false);

onMounted(() => {
  nextTick(() => {
    measureTabWidths();
    positioningReady.value = true;
    nextTick(() => {
      updateScrollIndicators();
      observeAllTabs();
    });
  });
});

const prevTabCount = ref(0);
watch(
  () => tabbarStore.getTabs.length,
  (newLen) => {
    if (dragState.dragging) return;
    const countChanged = newLen !== prevTabCount.value;
    prevTabCount.value = newLen;
    if (countChanged) {
      positioningReady.value = false;
      nextTick(() => {
        measureTabWidths();
        positioningReady.value = true;
        nextTick(() => {
          updateScrollIndicators();
          observeAllTabs();
        });
      });
    }
  },
);

// ============ 路由监听 ============

// vue-router 在 setup 中的 useRoute() 返回 RouteLocationNormalizedLoaded，
// 它的 `matched` 字段类型是 RouteLocationMatched[]，而 tabbar 的
// TabDefinition extends RouteLocationNormalized（matched: RouteRecordNormalized[]）。
// RouteLocationMatched extends RouteRecordNormalized，结构上兼容但 TS 类型系
// 统不可直接赋值；这里的 cast 是已知安全的结构窄化，不是逻辑欺骗。
watch(
  () => route.fullPath,
  () => {
    tabbarStore.addTab(route as unknown as RouteLocationNormalized);
    nextTick(() => scrollActiveTabToCenter(tabbarStore.getTabKey(route)));
  },
  { immediate: true },
);

// ============ 右键菜单 ============

const {
  contextMenuVisible,
  contextMenuX,
  contextMenuY,
  contextOptions,
  handleContextSelect,
  handleContextMenu,
  handleClickOutside,
} = useTabContextMenu({
  tabbarStore,
  router,
  t,
  isAffix,
});

// ============ UI 辅助 ============

// 项目沿用 LayoutSidebar 的 i18n 用法：route.meta.title 已经是 i18n key
// (例如 `page.dashboard.title`)，直接 t(title) 即可，无需 'page.' 前缀。
function getTabTitle(tab: RouteLocationNormalized): string {
  const newTitle = tab.meta?.newTabTitle as string;
  if (newTitle) return newTitle;
  const raw = (tab.meta?.title as string) || '';
  return raw ? t(raw) : '';
}

function isActive(tab: RouteLocationNormalized): boolean {
  return tabbarStore.getTabKey(route) === tabbarStore.getTabKey(tab);
}

function isAffix(tab: RouteLocationNormalized): boolean {
  return !!tab.meta?.affixTab;
}

function handleTabClick(tab: RouteLocationNormalized) {
  if (dragState.dragging) return;
  void router.push({ path: tab.path, query: tab.query });
}

function handleClose(tab: RouteLocationNormalized) {
  void tabbarStore.closeTab(
    tab as unknown as Parameters<typeof tabbarStore.closeTab>[0],
    router,
  );
}

function getTabBreadcrumb(tab: RouteLocationNormalized): string {
  const menus =
    userStore.accessMenus.filter((m) => !m.hideInBreadcrumb && m.path) || [];
  const tabPath = tab.path;

  function buildPath(path: string, visited = new Set<string>()): string[] {
    if (visited.has(path)) return [];
    visited.add(path);
    const menu = menus.find((m) => isPathMatch(m.path, path));
    if (!menu) return [];
    const title = menu.title ? t(menu.title) : '';
    if (menu.parentId === null) return [title];
    const parent = menus.find((m) => m.id === menu.parentId);
    if (!parent) return [title];
    return [...buildPath(parent.path, visited), title];
  }

  const parts = buildPath(tabPath);
  return parts.length > 1 ? parts.join(' / ') : getTabTitle(tab);
}

function handleMouseDown(e: MouseEvent, tab: RouteLocationNormalized) {
  if (e.button === 1 && tabbarPrefs.value.middleClickToClose && !isAffix(tab)) {
    e.preventDefault();
    handleClose(tab);
  }
}

function handleWheel(e: WheelEvent) {
  if (!tabbarPrefs.value.wheelable) return;
  const container = tabListRef.value;
  if (container) {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
    updateScrollIndicators();
  }
}
</script>

<template>
  <div
    v-if="tabbarPrefs.enable"
    class="layout-tabs relative flex select-none items-center"
  >
    <!-- 左侧滚动箭头 -->
    <Transition name="fade">
      <button
        v-if="showLeftArrow"
        class="scroll-arrow scroll-arrow-left z-1 flex shrink-0 cursor-pointer items-center justify-center"
        @click="scrollTo('left')"
      >
        <i class="i-lucide:chevron-left text-xs"></i>
      </button>
    </Transition>

    <!-- 标签列表 -->
    <div
      ref="tabListRef"
      class="scrollbar-hide flex-1 overflow-x-auto"
      @wheel="handleWheel"
      @scroll="updateScrollIndicators"
    >
      <div
        ref="tabTrackRef"
        class="tab-track relative"
        :style="
          positioningReady
            ? {
                width: `${totalTrackWidth}px`,
                height: `${CONTAINER_HEIGHT}px`,
              }
            : { height: `${CONTAINER_HEIGHT}px` }
        "
        :class="{ 'flex items-center gap-1.5': !positioningReady }"
      >
        <NTooltip
          v-for="tab in tabbarStore.getTabs"
          :key="tabbarStore.getTabKey(tab)"
          trigger="hover"
          :delay="500"
          :disabled="!tab.meta?.title"
        >
          <template #trigger>
            <div
              :data-tab-key="tabbarStore.getTabKey(tab)"
              class="group tab-item"
              :class="[
                isActive(tab) ? 'tab-active' : '',
                isAffix(tab) ? 'tab-affix' : '',
                dragState.dragging &&
                dragState.dragKey === tabbarStore.getTabKey(tab)
                  ? 'tab-dragging'
                  : '',
              ]"
              :style="positioningReady ? getTabStyle(tab) : {}"
              @click="handleTabClick(tab)"
              @contextmenu="handleContextMenu($event, tab)"
              @mousedown="
                (e: MouseEvent) => {
                  handleMouseDown(e, tab);
                  handleDragStart(e, tab);
                }
              "
            >
              <!-- 固定标签图标 -->
              <i
                v-if="isAffix(tab)"
                class="i-lucide:pin text-[10px] opacity-40"
              ></i>
              <!-- 标签标题 -->
              <span class="max-w-28 truncate whitespace-nowrap leading-none">
                {{ getTabTitle(tab) }}
              </span>
              <!-- 关闭按钮 - 右上角 -->
              <span
                v-if="!isAffix(tab)"
                class="tab-close-btn"
                :class="{
                  'always-show': isActive(tab),
                }"
                @click.stop="handleClose(tab)"
                @mousedown.stop
              >
                <i class="i-lucide:x"></i>
              </span>
            </div>
          </template>
          {{ getTabBreadcrumb(tab) }}
        </NTooltip>
      </div>
    </div>

    <!-- 右侧滚动箭头 -->
    <Transition name="fade">
      <button
        v-if="showRightArrow"
        class="scroll-arrow scroll-arrow-right z-1 flex shrink-0 cursor-pointer items-center justify-center"
        @click="scrollTo('right')"
      >
        <i class="i-lucide:chevron-right text-xs"></i>
      </button>
    </Transition>

    <!-- 溢出下拉 -->
    <NPopover
      v-if="hasOverflow && overflowTabs.length > 0"
      trigger="click"
      placement="bottom-end"
      :show-arrow="false"
    >
      <template #trigger>
        <button
          class="overflow-badge mx-1 flex shrink-0 cursor-pointer items-center justify-center"
        >
          +{{ overflowTabs.length }}
        </button>
      </template>
      <div class="max-h-60 w-48 overflow-y-auto py-1">
        <div
          v-for="tab in overflowTabs"
          :key="tab.key"
          class="cursor-pointer rounded-md px-3 py-1.5 text-[13px] text-[var(--n-text-color-2)] transition-colors hover:bg-[var(--n-color-hover)] hover:text-[rgb(var(--primary-color))]"
          @click="tab.props.onClick"
        >
          {{ tab.label }}
        </div>
      </div>
    </NPopover>

    <!-- 右键菜单 -->
    <NDropdown
      :show="contextMenuVisible"
      :options="contextOptions"
      :x="contextMenuX"
      :y="contextMenuY"
      placement="bottom-start"
      trigger="manual"
      @select="handleContextSelect"
      @clickoutside="handleClickOutside"
    />
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

/* ===== Tab Item 基础 ===== */
.tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 28px;
  gap: 5px;
  flex-shrink: 0;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  background: rgb(var(--container-bg-color));
  color: var(--n-text-color-3, #666);
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.25s ease,
    transform 0.15s ease;
}

/* 竖线分隔符 */
.tab-item + .tab-item::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, 0.1);
  transition: opacity 0.2s ease;
}

/* hover 时隐藏分隔线 */
.tab-item:hover::before,
.tab-item:hover + .tab-item::before {
  opacity: 0;
}

/* hover：加深文字 */
.tab-item:hover {
  color: var(--n-text-color, #333);
}

/* ===== 固定 tab 的图钉小一点 ===== */
.tab-item.tab-affix .i-lucide\:pin {
  font-size: 10px;
  opacity: 0.35;
}

/* ===== 激活标签 ===== */
.tab-item.tab-active {
  color: rgb(var(--primary-color));
  font-weight: 500;
  background: rgb(var(--container-bg-color));
  border-color: rgba(var(--primary-color), 0.2);
}

/* 底部渐变指示线 */
.tab-item.tab-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(
    90deg,
    rgba(var(--primary-color), 0.6),
    rgb(var(--primary-color))
  );
  transition: width 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}

.tab-item.tab-active:hover::after {
  width: 60%;
}

/* ===== 拖拽中 ===== */
.tab-item.tab-dragging {
  opacity: 0.95;
  border-color: rgba(var(--primary-color), 0.15);
  z-index: 10;
}

/* ===== 关闭按钮 — 右上角迷你圆 ===== */
.tab-close-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 9px;
  line-height: 1;
  background: rgba(0, 0, 0, 0.06);
  border: none;
  color: #999;
  cursor: pointer;
  z-index: 5;

  /* 默认隐藏 */
  opacity: 0;
  transform: scale(0.4);
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.15s ease,
    color 0.15s ease;
}

/* 仅 hover tab 时显示关闭按钮 */
.tab-item:hover .tab-close-btn {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

/* ===== 滚动箭头 ===== */
.scroll-arrow {
  width: 26px;
  height: 26px;
  margin: 0 3px;
  border-radius: 6px;
  color: var(--n-text-color-3);
  background: var(--n-color, rgb(var(--container-bg-color)));
  border: 1px solid rgba(128, 128, 128, 0.12);
  box-shadow: 0 1px 2px rgba(128, 128, 128, 0.06);
  transition: all 0.2s ease;
}

.scroll-arrow:hover {
  color: rgb(var(--primary-color));
  border-color: rgba(var(--primary-color), 0.25);
  box-shadow: 0 1px 4px rgba(var(--primary-color), 0.12);
}

/* ===== 溢出计数徽标 ===== */
.overflow-badge {
  height: 22px;
  min-width: 30px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: rgb(var(--primary-color));
  background: rgba(var(--primary-color), 0.08);
  border: 1px solid rgba(var(--primary-color), 0.2);
  transition: all 0.2s ease;
}

.overflow-badge:hover {
  background: rgba(var(--primary-color), 0.14);
  border-color: rgba(var(--primary-color), 0.4);
}

/* ===== 渐入渐出 ===== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
