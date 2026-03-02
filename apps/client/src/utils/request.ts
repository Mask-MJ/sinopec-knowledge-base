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
let refreshSubscribers: ((token: string) => void)[] = [];

// 订阅 token 刷新完成事件
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// 通知所有订阅者 token 已刷新
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// 重置刷新状态
function resetRefreshState() {
  isRefreshing = false;
  refreshSubscribers = [];
}

const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath }) {
    // 获取令牌，如果不存在
    const userStore = useUserStore();
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
        // 判断是密码错误还是令牌过期
        const data = await response.clone().json();

        // 登录接口返回 401（密码错误、用户名不存在等），直接显示错误，不刷新 token
        if (response.url.includes('/api/auth/authentication/sign-in')) {
          window.$message.error(data.error.message);
          return response;
        }

        // 其他 401 情况：令牌过期，尝试刷新令牌
        {
          // 令牌过期，刷新令牌
          const userStore = useUserStore();
          if (response.url.includes('/api/auth/authentication/refresh-token')) {
            // 刷新令牌接口返回401，说明刷新令牌也过期了，清除登录状态，跳转到登录页面
            resetRefreshState();
            userStore.$reset();
            window.$message.error($t('authentication.loginAgainSubTitle'));
            // 跳转到登录页面
            setTimeout(() => {
              window.location.href = LOGIN_PATH;
            }, 1000);
            return response;
          }

          // 如果已经在刷新中，等待刷新完成后重试请求
          if (isRefreshing) {
            return new Promise<Response>((resolve) => {
              subscribeTokenRefresh((newToken: string) => {
                // 使用新 token 重试原请求
                const newRequest = request.clone();
                newRequest.headers.set('Authorization', `Bearer ${newToken}`);
                resolve(fetch(newRequest));
              });
            });
          }

          // 开始刷新 token
          isRefreshing = true;
          try {
            const newToken = await userStore.refreshToken();
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
          } catch (error) {
            resetRefreshState();
            throw error;
          } finally {
            isRefreshing = false;
          }
        }
      } else {
        const data = await response.clone().json();
        if (isString(data.error)) {
          window.$message.error(data.error);
        } else {
          const errorMessage = data.error.message || [];
          if (Array.isArray(errorMessage)) {
            errorMessage.forEach((msg) => {
              window.$message.error(msg);
            });
          } else if (typeof errorMessage === 'string') {
            window.$message.error(errorMessage);
          }
        }
        // 抛出错误，方便调用接口的地方捕获
        throw new Error(data.error || 'Error');
      }
    }
    const kbDocRegex = /\/knowledge-base\/[^/]+\/documents\/[^/]+$/;
    if (kbDocRegex.test(response.url) || response.url.endsWith('completions')) {
      return undefined; // 不要修改某些路径的请求
    }
    const data = await response.clone().json();

    const formattedData = formatDateMiddleware(data);

    return new Response(JSON.stringify(formattedData));
  },
};

// 时间格式化中间件
// 判断返回的数据类型是对象还是数组
// 如果是对象，遍历对象的每个属性，如果属性是日期字符串，则格式化该属性
// 如果是数组，遍历数组的每个元素，如果元素是对象，则遍历对象的每个属性，如果属性是日期字符串，则格式化该属性
function formatDateMiddleware(data: any): any {
  const formatDateString = (dateString: string): string => {
    const date = dayjs(dateString);
    if (date.isValid()) {
      return date.format('YYYY-MM-DD HH:mm:ss');
    }
    return dateString;
  };

  if (Array.isArray(data)) {
    return data.map((item) => formatDateMiddleware(item));
  } else if (typeof data === 'object' && data !== null) {
    Object.keys(data).forEach((key) => {
      if (key === 'list' && Array.isArray(data[key])) {
        data[key] = data[key].map((item: any) => formatDateMiddleware(item));
      } else if (
        typeof data[key] === 'string' &&
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(data[key])
      ) {
        data[key] = formatDateString(data[key]);
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        data[key] = formatDateMiddleware(data[key]);
      }
    });
  }
  return data;
}

export const client = createClient<paths>();
client.use(authMiddleware);
