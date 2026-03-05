import type { paths } from '#/openapi'; // 由openapi-typescript生成
import type { Middleware } from 'openapi-fetch';

import dayjs from 'dayjs';
import { isString } from 'lodash-es';
import createClient from 'openapi-fetch';
import { storeToRefs } from 'pinia';

import { LOGIN_PATH } from '@/config/constants';
import { $t } from '@/locales';

const UNPROTECTED_ROUTES = [
  '/api/auth/authentication/refresh-token',
  '/api/auth/authentication/sign-in',
];

// Token 刷新状态管理
let isRefreshing = false;
let refreshSubscribers: {
  reject: (error: unknown) => void;
  resolve: (token: string) => void;
}[] = [];

// 订阅 token 刷新完成事件
function subscribeTokenRefresh(
  resolve: (token: string) => void,
  reject: (error: unknown) => void,
) {
  refreshSubscribers.push({ resolve, reject });
}

// 通知所有订阅者 token 已刷新
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
  refreshSubscribers = [];
}

// 通知所有订阅者 token 刷新失败
function onTokenRefreshFailed(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
}

// 重置刷新状态
function resetRefreshState() {
  isRefreshing = false;
  refreshSubscribers = [];
}

/** 安全解析 JSON 响应，非 JSON 内容返回 null */
async function safeParseJson(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return null;
  }
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

/** 保留原始响应元数据，只替换 body */
function createResponseWithMeta(body: any, original: Response): Response {
  return new Response(JSON.stringify(body), {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  });
}

/** ISO 8601 日期字符串正则（修正 `.` 为 `\.`） */
const ISO_DATE_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

/** 延迟获取 userStore，避免在 Pinia 初始化前调用 */
function getUserStore() {
  return useUserStore();
}

const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath }) {
    const userStore = getUserStore();
    const { token } = storeToRefs(userStore);
    if (
      UNPROTECTED_ROUTES.some((pathname) => schemaPath.startsWith(pathname))
    ) {
      return undefined; // don't modify request for certain paths
    }

    request.headers.set('Authorization', `Bearer ${token.value.accessToken}`);
  },

  async onResponse({ request, response }) {
    if (!response.status.toString().startsWith('2')) {
      if (response.status === 401) {
        const data = await safeParseJson(response);

        // 登录接口返回 401（密码错误、用户名不存在等），直接显示错误，不刷新 token
        if (response.url.includes('/api/auth/authentication/sign-in')) {
          window.$message.error(
            (data?.error as string) ?? 'Authentication failed',
          );
          return response;
        }

        // 刷新令牌接口返回 401，说明刷新令牌也过期了
        if (response.url.includes('/api/auth/authentication/refresh-token')) {
          resetRefreshState();
          getUserStore().$reset();
          window.$message.error($t('authentication.loginAgainSubTitle'));
          setTimeout(() => {
            window.location.href = LOGIN_PATH;
          }, 1000);
          return response;
        }

        // 如果已经在刷新中，等待刷新完成后重试请求
        if (isRefreshing) {
          return new Promise<Response>((resolve, reject) => {
            subscribeTokenRefresh((newToken: string) => {
              const newRequest = request.clone();
              newRequest.headers.set('Authorization', `Bearer ${newToken}`);
              resolve(fetch(newRequest));
            }, reject);
          });
        }

        // 开始刷新 token
        isRefreshing = true;
        try {
          const newToken = await getUserStore().refreshToken();
          if (newToken) {
            // 通知所有等待的请求
            onTokenRefreshed(newToken.accessToken);
            // 使用新 token 重试当前请求
            const newRequest = request.clone();
            newRequest.headers.set(
              'Authorization',
              `Bearer ${newToken.accessToken}`,
            );
            return fetch(newRequest);
          }
          // refreshToken 返回 null，视为刷新失败
          resetRefreshState();
          getUserStore().$reset();
          window.$message.error($t('authentication.loginAgainSubTitle'));
          setTimeout(() => {
            window.location.href = LOGIN_PATH;
          }, 1000);
          return response;
        } catch (error) {
          onTokenRefreshFailed(error);
          resetRefreshState();
          getUserStore().$reset();
          window.$message.error($t('authentication.loginAgainSubTitle'));
          setTimeout(() => {
            window.location.href = LOGIN_PATH;
          }, 1000);
          return response;
        } finally {
          isRefreshing = false;
        }
      } else {
        // 非 401 错误处理
        const data = await safeParseJson(response);
        if (data) {
          const errorMsg = data.error ?? data.message;
          if (isString(errorMsg)) {
            window.$message.error(errorMsg);
          } else if (errorMsg && typeof errorMsg === 'object') {
            const messages = errorMsg.message || [];
            if (Array.isArray(messages)) {
              messages.forEach((msg: string) => {
                window.$message.error(msg);
              });
            } else if (typeof messages === 'string') {
              window.$message.error(messages);
            }
          }
          throw new Error(isString(errorMsg) ? errorMsg : 'Request failed');
        }
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // 2xx 成功响应处理
    const kbDocRegex = /\/knowledge-base\/[^/]+\/documents\/[^/]+$/;
    if (kbDocRegex.test(response.url) || response.url.endsWith('completions')) {
      return undefined; // 不要修改某些路径的响应
    }

    const data = await safeParseJson(response);
    if (data === null) {
      return undefined; // 非 JSON 响应，原样返回
    }

    const formattedData = formatDateMiddleware(data);
    return createResponseWithMeta(formattedData, response);
  },
};

/**
 * 时间格式化中间件
 * 递归遍历响应数据，将 ISO 8601 日期字符串转换为本地格式
 */
function formatDateMiddleware(data: unknown): unknown {
  const formatDateString = (dateString: string): string => {
    const date = dayjs(dateString);
    return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : dateString;
  };

  if (Array.isArray(data)) {
    return data.map((item: unknown) => formatDateMiddleware(item));
  }

  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
        result[key] = formatDateString(value);
      } else if (typeof value === 'object' || Array.isArray(value)) {
        result[key] = formatDateMiddleware(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return data;
}

export const client = createClient<paths>();
client.use(authMiddleware);
