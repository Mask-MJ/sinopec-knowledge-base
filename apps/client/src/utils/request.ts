import type { paths } from '#/openapi'; // 由openapi-typescript生成
import type { Middleware } from 'openapi-fetch';

import { isString } from 'lodash-es';
import createClient from 'openapi-fetch';
import { storeToRefs } from 'pinia';

import { LOGIN_PATH } from '@/config/constants';
import { $t } from '@/locales';
import { router } from '@/router';
import { useUserStore } from '@/stores/modules/user';
import { formatDateTime } from '@/utils/date';

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

function subscribeTokenRefresh(
  resolve: (token: string) => void,
  reject: (error: unknown) => void,
) {
  refreshSubscribers.push({ resolve, reject });
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach(({ resolve }) => {
    resolve(newToken);
  });
  refreshSubscribers = [];
}

function onTokenRefreshFailed(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => {
    reject(error);
  });
  refreshSubscribers = [];
}

function resetRefreshState() {
  isRefreshing = false;
  refreshSubscribers = [];
}

async function safeParseJson(response: Response): Promise<unknown> {
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

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function formatDateFields(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string' && ISO_DATE_RE.test(data)) {
    return formatDateTime(data);
  }
  if (Array.isArray(data)) return data.map((item) => formatDateFields(item));
  if (typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [
        k,
        formatDateFields(v),
      ]),
    );
  }
  return data;
}

function createResponseWithMeta(body: unknown, original: Response): Response {
  return new Response(JSON.stringify(body), {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  });
}

function getUserStore() {
  return useUserStore();
}

function handleAuthFailure(error?: unknown) {
  if (error !== undefined) {
    onTokenRefreshFailed(error);
  }
  resetRefreshState();
  getUserStore().$reset();
  window.$message.error($t('authentication.loginAgainSubTitle'));
  void router.push(LOGIN_PATH);
}

const authMiddleware: Middleware = {
  onRequest({ request, schemaPath }) {
    const userStore = getUserStore();
    const { token } = storeToRefs(userStore);
    if (
      UNPROTECTED_ROUTES.some((pathname) => schemaPath.startsWith(pathname))
    ) {
      return undefined;
    }

    request.headers.set('Authorization', `Bearer ${token.value.accessToken}`);
  },

  async onResponse({ request, response }) {
    if (!response.status.toString().startsWith('2')) {
      if (response.status === 401) {
        const data = (await safeParseJson(response)) as null | Record<
          string,
          unknown
        >;

        // 登录 / 改密接口返回 401（密码错、用户不存在等）：直接展示错误，
        // 不应走 token refresh 流程（旧密码错误 ≠ access token 过期）。
        if (
          response.url.includes('/api/auth/authentication/sign-in') ||
          response.url.includes('/api/system/user/changePassword')
        ) {
          const rawError = data?.error;
          const errorMsg =
            typeof rawError === 'object' && rawError !== null
              ? (rawError as { message?: unknown }).message
              : rawError;
          if (isString(errorMsg)) {
            window.$message.error(errorMsg);
          } else if (Array.isArray(errorMsg)) {
            errorMsg.forEach((msg) => window.$message.error(String(msg)));
          } else {
            window.$message.error('Authentication failed');
          }
          return response;
        }

        if (response.url.includes('/api/auth/authentication/refresh-token')) {
          handleAuthFailure();
          return response;
        }

        if (isRefreshing) {
          return new Promise<Response>((resolve, reject) => {
            subscribeTokenRefresh((newToken: string) => {
              const newRequest = request.clone();
              newRequest.headers.set('Authorization', `Bearer ${newToken}`);
              resolve(fetch(newRequest));
            }, reject);
          });
        }

        isRefreshing = true;
        try {
          const newToken = await getUserStore().refreshToken();
          if (newToken) {
            onTokenRefreshed(newToken.accessToken);
            const newRequest = request.clone();
            newRequest.headers.set(
              'Authorization',
              `Bearer ${newToken.accessToken}`,
            );
            return await fetch(newRequest);
          }
          handleAuthFailure();
          return response;
        } catch (error) {
          handleAuthFailure(error);
          return response;
        } finally {
          isRefreshing = false;
        }
      } else {
        const data = (await safeParseJson(response)) as null | Record<
          string,
          unknown
        >;
        if (data) {
          const errorMsg = data.error ?? data.message;
          if (isString(errorMsg)) {
            window.$message.error(errorMsg);
          } else if (errorMsg && typeof errorMsg === 'object') {
            const record = errorMsg as Record<string, unknown>;
            const messages = record.message || [];
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

    const kbDocRegex = /\/knowledge-base\/[^/]+\/documents\/[^/]+$/;
    if (kbDocRegex.test(response.url) || response.url.endsWith('completions')) {
      return undefined;
    }

    const data = await safeParseJson(response);
    if (data === null) {
      return undefined;
    }

    return createResponseWithMeta(formatDateFields(data), response);
  },
};

export const client = createClient<paths>();
client.use(authMiddleware);
