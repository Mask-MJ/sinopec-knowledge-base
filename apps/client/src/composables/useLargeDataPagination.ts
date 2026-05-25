import type { ComputedRef } from 'vue';

const DEFAULT_PAGE_SLOT = 7;
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

interface Options {
  pageSizes?: number[];
  pageSlot?: number;
}

/**
 * 大数据量分页优化：隐藏末页按钮、关闭快速跳转，防止深度分页查询。
 * 仅当页数超过 pageSlot 时生效，少量数据的分页行为不受影响。
 */
export function useLargeDataPagination<T extends { pagination: unknown }>(
  rawTableProps: ComputedRef<T>,
  options: Options = {},
) {
  const pageSlot = options.pageSlot ?? DEFAULT_PAGE_SLOT;
  const pageSizes = options.pageSizes ?? DEFAULT_PAGE_SIZES;

  return computed(() => {
    const { pagination, ...rest } = rawTableProps.value;
    const pag =
      pagination && typeof pagination === 'object'
        ? (pagination as Record<string, unknown>)
        : {};
    const itemCount = Number(pag.itemCount ?? 0);
    const pageSize = Number(pag.pageSize || 10);
    const pageCount = Math.ceil(itemCount / pageSize);

    return {
      ...rest,
      pagination: {
        ...pag,
        pageSlot,
        pageSizes,
        showSizePicker: true,
        showQuickJumper: false,
        showQuickJumpDropdown: false,
      },
      class: pageCount > pageSlot ? 'hide-last-page' : '',
    };
  });
}
