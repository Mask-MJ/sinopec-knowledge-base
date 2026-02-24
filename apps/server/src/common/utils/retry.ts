import { Logger } from '@nestjs/common';

export interface RetryOptions {
  /** 基础延迟（ms），默认 200，实际延迟 = baseDelay * 2^attempt */
  baseDelay?: number;
  /** 日志前缀 */
  label?: string;
  /** 自定义 Logger（可选） */
  logger?: Logger;
  /** 最大重试次数（不含首次调用），默认 3 */
  maxRetries?: number;
  /**
   * 自定义重试判断（可选）
   *
   * 返回 true 时重试，返回 false 时直接抛出。
   * 默认：所有错误都重试。
   *
   * @example QPS 限流专用
   * shouldRetry: (err) => err.message.includes('40100')
   */
  shouldRetry?: (error: Error) => boolean;
  /** 单次调用超时（ms），默认 60000（60s），超时后自动重试 */
  timeout?: number;
}

/**
 * 通用指数退避重试
 *
 * @description
 * 对任意异步操作添加指数退避重试。
 * 延迟策略：baseDelay * 2^attempt (200ms → 400ms → 800ms)
 *
 * @example
 * const result = await withRetry(
 *   () => client.api.ShopPerformanceGet(...),
 *   { label: '[Katch Me UK] Analytics API', logger }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 200,
    timeout = 60_000,
    label,
    shouldRetry,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // 包裹超时保护，防止 API 挂住导致无限等待
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`${label || 'Operation'} 超时 (${timeout}ms)`)),
            timeout,
          );
        }),
      ]);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // shouldRetry 返回 false 时直接抛出，不重试
      if (shouldRetry && !shouldRetry(err)) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  // TypeScript: 理论不可达，但满足类型检查
  throw new Error('withRetry: unreachable');
}
