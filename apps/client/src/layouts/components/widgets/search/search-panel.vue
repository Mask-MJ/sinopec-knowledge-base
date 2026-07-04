<script setup lang="ts">
import type { MenuInfo } from '@/api/system/menu';

import { $t } from '@/locales';
import { isHttpUrl, uniqueByField } from '@/utils';

defineOptions({ name: 'SearchPanel' });

const props = withDefaults(defineProps<{ keyword?: string }>(), {
  keyword: '',
});
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const userStore = useUserStore();
const searchHistory = useLocalStorage<MenuInfo[]>(
  `__search-history-${location.hostname}__`,
  [],
);
const activeIndex = ref(-1);
// 响应式派生：菜单由路由守卫异步填充，用 computed 才能在菜单到达后自动更新；
// 旧实现是 onMounted 里一次性赋值，菜单后到时搜索项不会刷新。
const searchItems = computed<MenuInfo[]>(() =>
  userStore.accessMenus.map((item) => ({
    ...item,
    name: $t(item?.name),
  })),
);
const searchResults = ref<MenuInfo[]>([]);

const handleSearch = useThrottleFn(search, 200);

// 搜索函数，用于根据搜索关键词查找匹配的菜单项
function search(searchKey: string) {
  // 去除搜索关键词的前后空格
  searchKey = searchKey.trim();

  // 如果搜索关键词为空，清空搜索结果并返回
  if (!searchKey) {
    searchResults.value = [];
    return;
  }

  // 使用搜索关键词创建正则表达式
  const reg = createSearchReg(searchKey);

  // 初始化结果数组
  const results: MenuInfo[] = [];
  searchItems.value.forEach((item) => {
    // 如果菜单项的名称匹配正则表达式，将其添加到结果数组中
    if (reg.test(item.name?.toLowerCase())) {
      results.push(item);
    }
  });

  // 更新搜索结果
  searchResults.value = results;

  // 如果有搜索结果，设置索引为 0
  if (results.length > 0) {
    activeIndex.value = 0;
  }

  // 赋值索引为 0
  activeIndex.value = 0;
}

// When the keyboard up and down keys move to an invisible place
// the scroll bar needs to scroll automatically
function scrollIntoView() {
  const element = document.querySelector(
    `[data-search-item="${activeIndex.value}"]`,
  );

  if (element) {
    element.scrollIntoView({ block: 'nearest' });
  }
}

// enter keyboard event
async function handleEnter() {
  if (searchResults.value.length === 0) {
    return;
  }
  const result = searchResults.value;
  const index = activeIndex.value;
  if (result.length === 0 || index < 0) {
    return;
  }
  const to = result[index];
  if (to) {
    searchHistory.value.push(to);
    handleClose();
    await nextTick();
    if (isHttpUrl(to.path)) {
      window.open(to.path, '_blank');
    } else {
      router.push({ path: to.path, replace: true });
    }
  }
}

// Arrow key up
function handleUp() {
  if (searchResults.value.length === 0) {
    return;
  }
  activeIndex.value--;
  if (activeIndex.value < 0) {
    activeIndex.value = searchResults.value.length - 1;
  }
  scrollIntoView();
}

// Arrow key down
function handleDown() {
  if (searchResults.value.length === 0) {
    return;
  }
  activeIndex.value++;
  if (activeIndex.value > searchResults.value.length - 1) {
    activeIndex.value = 0;
  }
  scrollIntoView();
}

// close search modal
function handleClose() {
  searchResults.value = [];
  emit('close');
}

// Activate when the mouse moves to a certain line
function handleMouseenter(e: MouseEvent) {
  const index = (e.target as HTMLElement)?.dataset.index;
  activeIndex.value = Number(index);
}

function removeItem(index: number) {
  if (props.keyword) {
    searchResults.value.splice(index, 1);
  } else {
    searchHistory.value.splice(index, 1);
  }
  activeIndex.value = Math.max(activeIndex.value - 1, 0);
  scrollIntoView();
}

// 存储所有需要转义的特殊字符
const code = new Set([
  '$',
  '(',
  ')',
  '*',
  '+',
  '.',
  '?',
  '[',
  '\\',
  ']',
  '^',
  '{',
  '|',
  '}',
]);

// 转换函数，用于转义特殊字符
function transform(c: string) {
  return code.has(c) ? `\\${c}` : c;
}

// 创建搜索正则表达式
function createSearchReg(key: string) {
  const keys = [...key].map((item) => transform(item)).join('.*');
  return new RegExp(`.*${keys}.*`);
}

watch(
  () => props.keyword,
  (val) => {
    if (val) {
      handleSearch(val);
    } else {
      searchResults.value = [...searchHistory.value];
    }
  },
);

onMounted(() => {
  // 如果有初始关键词，进行搜索
  if (searchHistory.value.length > 0) {
    searchResults.value = searchHistory.value;
  }
  // enter search
  onKeyStroke('Enter', handleEnter);
  // Monitor keyboard arrow keys
  onKeyStroke('ArrowUp', handleUp);
  onKeyStroke('ArrowDown', handleDown);
  // esc close
  onKeyStroke('Escape', handleClose);
});
</script>

<template>
  <NScrollbar>
    <div class="h-full min-h-40 justify-center px-2 sm:max-h-[450px] !flex">
      <!-- 无搜索结果 -->
      <div v-if="keyword && searchResults.length === 0" class="text-center">
        <NEmpty class="mt-12">
          {{ $t('ui.widgets.search.noResults') }}
          <span class="text-sm text-gray-700 font-medium">
            "{{ keyword }}"
          </span>
        </NEmpty>
      </div>
      <!-- 历史搜索记录 & 没有搜索结果 -->
      <NEmpty v-if="!keyword && searchResults.length === 0" class="mt-12">
        {{ $t('ui.widgets.search.noRecent') }}
      </NEmpty>

      <ul v-show="searchResults.length > 0" class="w-full">
        <li
          v-if="searchHistory.length > 0 && !keyword"
          class="mb-2 text-xs text-gray-700"
        >
          {{ $t('ui.widgets.search.recent') }}
        </li>
        <li
          v-for="(item, index) in uniqueByField(
            searchResults,
            'path',
          ) as MenuInfo[]"
          :key="item.path"
          :class="activeIndex === index ? 'active bg-primary text-white' : ''"
          :data-index="index"
          :data-search-item="index"
          class="mb-3 w-full flex-center cursor-pointer rounded-lg bg-layout px-4 py-4"
          @click="handleEnter"
          @mouseenter="handleMouseenter"
        >
          <i :class="item.icon" class="mr-2 size-5 flex-shrink-0"></i>

          <span class="flex-1">{{ item.name }}</span>
          <div
            class="flex-center rounded-full p-1 hover:scale-110"
            @click.stop="removeItem(index)"
          >
            <i class="i-ant-design:close-outlined size-4"></i>
          </div>
        </li>
      </ul>
    </div>
  </NScrollbar>
</template>
