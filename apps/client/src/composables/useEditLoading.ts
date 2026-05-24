import type { Ref } from 'vue';

/**
 * 编辑加载封装
 *
 * 提取 system 模块 6 个页面重复的 edit 编排模式：
 *   loadingBar.start() → fetch → restoreFieldsValue → values = data → open → finish
 *
 * 支持可选的 transform 回调（如 user 页面需要映射 roleIds）。
 *
 * @example
 * const editLoading = useEditLoading()
 *
 * const edit = (row: SomeType) =>
 *   editLoading(drawerForm, () => getDetail(row.id))
 *
 * // 带 transform
 * const edit = (row: UserInfo) =>
 *   editLoading(modalForm, () => getUserDetail(row.id), {
 *     transform: (data) => ({ ...data, roleIds: data.roles.map(r => r.id) }),
 *   })
 */
export function useEditLoading() {
  return async <T>(
    form: {
      open: () => void;
      restoreFieldsValue: () => void;
      values: Ref<unknown>;
    },
    fetcher: () => Promise<{ data?: null | T }>,
    options?: {
      /** 对 API 返回数据做转换后再赋值给 form */
      transform?: (data: NonNullable<T>) => Record<string, unknown>;
    },
  ) => {
    window.$loadingBar.start();
    try {
      const { data } = await fetcher();
      if (!data) {
        window.$loadingBar.finish();
        return;
      }
      form.restoreFieldsValue();
      form.values.value = options?.transform ? options.transform(data) : data;
      form.open();
      window.$loadingBar.finish();
    } catch (error) {
      window.$loadingBar.error();
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[useEditLoading] fetch failed', error);
      }
    }
  };
}
