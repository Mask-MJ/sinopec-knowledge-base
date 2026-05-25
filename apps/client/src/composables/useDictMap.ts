import type { DictDataInfo } from '@/api/system/dict';

import { getDictDataList } from '@/api/system/dict';

/**
 * 模块级字典缓存
 *
 * 同一个 dictType 的字典数据只请求一次 API，所有组件共享。
 * key = dictType（如 'orderStatus'），value = DictDataInfo[]
 */
const dictCache = new Map<string, DictDataInfo[]>();

/**
 * 请求去重：同一个 dictType 的并发请求合并为同一个 Promise
 */
const pendingRequests = new Map<string, Promise<DictDataInfo[]>>();

/**
 * 加载指定字典类型的数据（带缓存 + 去重）
 *
 * 使用 IIFE + async/await 线性化控制流，确保缓存语义清晰：
 * - 仅缓存有效数据（items.length > 0）
 * - 失败不缓存，下次调用自动重试（自愈能力）
 */
async function loadDictData(dictType: string): Promise<DictDataInfo[]> {
  // 1. 命中缓存直接返回
  const cached = dictCache.get(dictType);
  if (cached) return cached;

  // 2. 已有进行中的请求，复用同一个 Promise
  const pending = pendingRequests.get(dictType);
  if (pending) return pending;

  // 3. 发起新请求（IIFE 保持去重能力）
  const promise = (async () => {
    try {
      const { data } = await getDictDataList({ dictValue: dictType });
      const items = data ?? [];
      if (items.length > 0) dictCache.set(dictType, items); // 仅缓存有效数据
      return items;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(`[useDictMap] Failed to load dict "${dictType}":`, error);
      }
      return [] as DictDataInfo[];
      // 失败 → 不缓存 → 下次调用会重新请求（自愈）
    } finally {
      pendingRequests.delete(dictType);
    }
  })();

  pendingRequests.set(dictType, promise);
  return promise;
}

/**
 * 字典映射 Composable
 *
 * 按字典类型加载字典数据并构建 value → name 映射表。
 * 提供翻译函数 `getDictLabel`，支持本地硬编码兜底。
 *
 * @param dictType - 字典类型标识（对应 Dict.value），如 'orderStatus'
 * @param fallbackMap - 可选的本地硬编码兜底映射
 *
 * @example
 * ```ts
 * const { getDictLabel, loading } = useDictMap('orderStatus', {
 *   UNPAID: t('page.erp.order.status.unpaid'),
 * })
 * getDictLabel('UNPAID') // → 字典翻译 或 fallback 翻译 或 'UNPAID'
 * ```
 */
export function useDictMap(
  dictType: string,
  fallbackMap?: Record<string, string>,
) {
  const dictMap = ref<Record<string, string>>({});
  const items = ref<DictDataInfo[]>([]);
  const loading = ref(false);

  // 初始化加载
  const init = async () => {
    loading.value = true;
    try {
      const loadedItems = await loadDictData(dictType);
      const map: Record<string, string> = {};
      const activeItems: DictDataInfo[] = [];
      for (const item of loadedItems) {
        if (item.status) {
          map[item.value] = item.name;
          activeItems.push(item);
        }
      }
      dictMap.value = map;
      items.value = activeItems;
    } finally {
      loading.value = false;
    }
  };

  init().catch(() => {
    // loadDictData 内部已处理，此处仅防御 unhandled rejection
  });

  /**
   * 获取字典翻译标签
   *
   * 优先级：字典 API → 本地 fallbackMap → 原始值
   */
  const getDictLabel = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    // 字典 value 在后端定义里是 string / number / boolean 三选一；其它类型
    // 视为脏数据，回退到 '-' 而不是 '[object Object]'。
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return '-';
    }
    const key = String(value);
    return dictMap.value[key] || fallbackMap?.[key] || key;
  };

  /** Select 组件兼容的选项列表（保留后端 order 排序，fallbackMap 兜底） */
  const options = computed(() => {
    if (items.value.length > 0) {
      return items.value.map((item) => ({
        label: item.name,
        value: item.value,
      }));
    }
    // 字典未加载或为空时，从 fallbackMap 生成兜底选项
    if (fallbackMap) {
      return Object.entries(fallbackMap).map(([value, label]) => ({
        label,
        value,
      }));
    }
    return [];
  });

  return {
    /** 字典映射表 { value: name } */
    dictMap,
    /** 原始字典数据项（仅活跃项） */
    items,
    /** Select 组件兼容选项 { label, value }[] */
    options,
    /** 获取翻译标签 */
    getDictLabel,
    /** 加载状态 */
    loading,
  };
}

/**
 * 清除全部字典缓存（供管理员修改字典后前端主动失效）
 */
export function clearDictCache() {
  dictCache.clear();
  pendingRequests.clear();
}

// HMR 开发环境缓存清理
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dictCache.clear();
    pendingRequests.clear();
  });
}
