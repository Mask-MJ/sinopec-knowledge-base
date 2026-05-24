import { ApiError } from '@/utils/request';

/**
 * 表单 loading 封装
 *
 * 提供独立的 loading ref 和 withLoading 高阶函数，解决：
 *   - 多个弹窗共享 loading ref 导致交叉干扰
 *   - onSubmit 缺少 try/catch/finally 导致 loading 永久卡住
 *
 * 错误处理策略：
 *   API 层的 request.ts 拦截器已通过 $message 展示后端错误后 throw ApiError。
 *   catch 中仅静默处理 ApiError 实例（避免重复弹错误提示）。
 *   其他异常（TypeError/SyntaxError/代码 bug 等）会被重新抛出。
 *
 * @example
 * const { loading, withLoading } = useFormLoading()
 * const form = createProModalForm({
 *   onSubmit: (values) => withLoading(async () => {
 *     await createUser(values)
 *     form.close()
 *   }),
 * })
 */
export function useFormLoading() {
  const loading = ref(false);

  const withLoading = async <T>(
    fn: () => Promise<T>,
  ): Promise<T | undefined> => {
    loading.value = true;
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ApiError) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[useFormLoading]', error.message);
        }
        return undefined;
      }
      // 其他异常（TypeError/SyntaxError/代码 bug 等）不应被吞掉
      throw error;
    } finally {
      loading.value = false;
    }
  };

  return { loading, withLoading };
}
