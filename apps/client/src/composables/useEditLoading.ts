import type { Ref } from 'vue';

import { ApiError } from '@/utils/request';

/**
 * 编辑加载封装
 *
 * 提取 system 模块 6 个页面重复的 edit 编排模式：
 *   loadingBar.start() → fetch → restoreFieldsValue → values = data → open → finish
 *
 * 错误处理策略（与 useFormLoading 保持一致）：
 *   - ApiError：拦截器已通过 $message 展示过提示，静默 + 结束 loadingBar；
 *   - 其他异常（TypeError / SyntaxError / 代码 bug 等）：rethrow，避免代码级
 *     问题被静默吞掉。
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
      if (error instanceof ApiError) {
        if (import.meta.env.DEV) {
          console.warn('[useEditLoading]', error.message);
        }
        return;
      }
      // 非 ApiError 视为真实代码错误，rethrow 让外层感知，避免静默失败。
      throw error;
    }
  };
}
