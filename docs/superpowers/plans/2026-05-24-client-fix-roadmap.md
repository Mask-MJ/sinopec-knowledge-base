# Client 修复路线图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `apps/client` 与参考项目 `data-hub/client` 对比发现的 P0 紧急 Bug、补齐 P1 中后台模板能力、清理 P2 代码异味，让中石化知识库前端达到企业级中后台模板水平。

**Architecture:** 三阶段渐进式修复。P0 改既有文件修 Bug，零外部依赖、零接口变化、可独立 release；P1 引入跨页面通用能力（错误体系/状态体系/版本检查/多页签），按模块独立可上线；P2 是收尾清理与可选优化。

**Tech Stack:** Vue 3 + TypeScript + Naive UI + Pinia + Vue Router + VueUse (`useStorage`/`useDark`) + openapi-fetch + Vitest + UnoCSS。

**参考目录：**
- 当前项目：`/root/code/sinopec-knowledge-base/apps/client/`
- 参考模板：`/root/code/data-hub/client/`

---

## Phase P0：紧急 Bug 修复（预估 2-3 天）

P0 阶段每个 task 独立可 commit，独立可 PR。

### Task P0-1: 修复 `request.ts` 中 `getUserStore` 未导入

**Files:**
- Modify: `apps/client/src/utils/request.ts:91-93`

**Background:** `request.ts:92` 调用 `useUserStore()` 但文件顶部未 import。当前依赖 Vue 全局 auto-import 巧合通过；一旦移除 auto-import 配置或 SSR 渲染立即崩。

- [ ] **Step 1: 写测试验证 import 存在**

```typescript
// apps/client/src/utils/__tests__/request.spec.ts
import { describe, expect, it } from 'vitest';

describe('request module', () => {
  it('should not rely on global useUserStore auto-import', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../request.ts', import.meta.url), 'utf-8'),
    );
    expect(source).toMatch(/import.*useUserStore.*from.*stores/);
  });
});
```

- [ ] **Step 2: 运行测试，预期 FAIL**

Run: `pnpm -F @sinopec-kb/client vitest run src/utils/__tests__/request.spec.ts`
Expected: FAIL

- [ ] **Step 3: 在 request.ts 顶部新增 import**

```typescript
// apps/client/src/utils/request.ts (在已有 import 区域追加)
import { useUserStore } from '@/stores/modules/user';
```

- [ ] **Step 4: 运行测试，预期 PASS**

Run: `pnpm -F @sinopec-kb/client vitest run src/utils/__tests__/request.spec.ts`
Expected: PASS

- [ ] **Step 5: 验证 typecheck**

Run: `pnpm -F @sinopec-kb/client typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/utils/request.ts apps/client/src/utils/__tests__/request.spec.ts
git commit -m "fix(@sinopec-kb/client): 🐛 explicitly import useUserStore in request.ts"
```

---

### Task P0-2: changePassword 401 不应触发 token refresh

**Files:**
- Modify: `apps/client/src/utils/request.ts:126-131`

**Background:** 当前 `request.ts:126-131` 只对 `sign-in` 路径区分"密码错误"vs"token 过期"。改密接口 (`/api/system/user/changePassword`) 返回 401 时（原密码错误），当前代码会去刷 token，导致刷新成功后用错密码重试，UX 错乱。

- [ ] **Step 1: 写测试，期望 changePassword 401 不调用 refreshToken**

```typescript
// apps/client/src/utils/__tests__/request-401.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

describe('request 401 handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    (globalThis as any).window = { $message: { error: vi.fn() } };
  });

  it('treats changePassword 401 as direct error, not token expiry', async () => {
    const { useUserStore } = await import('@/stores/modules/user');
    const userStore = useUserStore();
    const refreshSpy = vi.spyOn(userStore, 'refreshToken');

    // 模拟 changePassword 接口返回 401
    const mockResponse = new Response(
      JSON.stringify({ error: { message: '原密码错误' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
    Object.defineProperty(mockResponse, 'url', {
      value: 'http://localhost/api/system/user/changePassword',
    });

    // 触发 middleware 的 onResponse 分支（具体调用看 request.ts 导出）
    // 至少断言 refreshToken 未被调用
    // ...（实现细节根据 middleware 暴露方式调整）

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试，预期 FAIL**

Run: `pnpm -F @sinopec-kb/client vitest run src/utils/__tests__/request-401.spec.ts`
Expected: FAIL

- [ ] **Step 3: 修改 request.ts:126-131，把 sign-in 分支扩展为 sign-in + changePassword**

替换 `apps/client/src/utils/request.ts:126-131` 为：

```typescript
        // 登录 / 改密接口的 401：密码错误，不应走 refresh-token 流程
        if (
          response.url.includes('/api/auth/authentication/sign-in') ||
          response.url.includes('/api/system/user/changePassword')
        ) {
          const errorMsg =
            (data?.error as { message?: string } | undefined)?.message ??
            (data?.error as string | undefined);
          if (isString(errorMsg)) {
            window.$message.error(errorMsg);
          } else if (Array.isArray(errorMsg)) {
            errorMsg.forEach((msg) => window.$message.error(String(msg)));
          }
          return response;
        }
```

- [ ] **Step 4: 运行测试，预期 PASS**

Run: `pnpm -F @sinopec-kb/client vitest run src/utils/__tests__/request-401.spec.ts`
Expected: PASS

- [ ] **Step 5: 手动验证**：起前端，用错误的旧密码触发改密，应直接看到"原密码错误"提示，Network 面板无 `/refresh-token` 调用。

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/utils/request.ts apps/client/src/utils/__tests__/request-401.spec.ts
git commit -m "fix(@sinopec-kb/client): 🐛 changePassword 401 should not trigger token refresh"
```

---

### Task P0-3: Token 刷新订阅者在失败路径未被通知

**Files:**
- Modify: `apps/client/src/utils/request.ts:138-167`

**Background:** 当前实现中 `refreshSubscribers` 用 `{ resolve, reject }` 对象数组。但代码路径里：
1. `refreshToken()` 抛异常 → `catch` 内调用 `handleAuthFailure(error)`，会调用 `onTokenRefreshFailed(error)`，OK；
2. **`refreshToken()` 返回 `null` / `undefined`** → 走 `handleAuthFailure()` 不传 error → `onTokenRefreshFailed` 不被调用 → 订阅者永远 hang；
3. **当前 if(isRefreshing) 分支用 `subscribeTokenRefresh(resolve, reject)`，但 reject 路径目前在 handleAuthFailure 中只有显式 error 时才触发，等同 bug #2**。

**修复策略：** 改为 data-hub 的"单回调"模型 + 在所有失败路径都显式触发 reject。

- [ ] **Step 1: 写测试，模拟两个并发 401 + refreshToken 返回 null**

```typescript
// apps/client/src/utils/__tests__/request-refresh-race.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

describe('token refresh race', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('all pending subscribers are notified when refresh returns null', async () => {
    const { useUserStore } = await import('@/stores/modules/user');
    const userStore = useUserStore();
    vi.spyOn(userStore, 'refreshToken').mockResolvedValue(null as any);

    // 并发触发 2 个 401 请求 → 第一个走 refresh、第二个走 subscribe
    // 断言两个 promise 都在合理时间内 settle（resolve 为 401 response 或 reject）
    // 不允许 hang 超过 1 秒
    // 实现：通过 fetch mock + middleware 直接调用
    // ...
  });
});
```

- [ ] **Step 2: 运行测试，预期 FAIL（订阅者 hang）**

- [ ] **Step 3: 重写 `request.ts` 中订阅者管理（19-49 行）和 401 分支（138-167 行）**

替换 `apps/client/src/utils/request.ts:18-49` 为：

```typescript
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
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ resolve }) => resolve(newToken));
}

function onTokenRefreshFailed(error: unknown) {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ reject }) => reject(error));
}

function resetRefreshState() {
  isRefreshing = false;
  onTokenRefreshFailed(new Error('Token refresh cancelled'));
}
```

替换 401 主分支（原 148-167 行）为：

```typescript
        isRefreshing = true;
        try {
          const newToken = await getUserStore().refreshToken();
          if (newToken?.accessToken) {
            onTokenRefreshed(newToken.accessToken);
            const newRequest = request.clone();
            newRequest.headers.set(
              'Authorization',
              `Bearer ${newToken.accessToken}`,
            );
            return await fetch(newRequest);
          }
          // refreshToken 返回 null / 空 token：刷新失败，通知所有订阅者
          const err = new Error('Token refresh returned empty');
          onTokenRefreshFailed(err);
          handleAuthFailure();
          return response;
        } catch (error) {
          onTokenRefreshFailed(error);
          handleAuthFailure();
          return response;
        } finally {
          isRefreshing = false;
        }
```

同时简化 `handleAuthFailure`，移除可选 error 参数（订阅者通知已由调用方负责）：

```typescript
function handleAuthFailure() {
  getUserStore().$reset();
  window.$message.error($t('authentication.loginAgainSubTitle'));
  void router.push(LOGIN_PATH);
}
```

- [ ] **Step 4: 运行测试，预期 PASS**

- [ ] **Step 5: 手动验证**
  - 起前端，让 access token 过期、refresh token 也过期
  - 在两个 tab 同时触发受保护接口
  - 都应该被拒、跳转登录页，无 hang

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/utils/request.ts apps/client/src/utils/__tests__/request-refresh-race.spec.ts
git commit -m "fix(@sinopec-kb/client): 🐛 notify all 401 subscribers on token refresh failure"
```

---

### Task P0-4: Preferences store 改为 useStorage 持久化

**Files:**
- Modify: `apps/client/src/stores/modules/preferences.ts:25-31`

**Background:** 当前 `state = ref<Preferences>(initPreferences())`，刷新页面后用户的"主题色 / 暗黑模式 / 语言 / 布局"全部丢失。data-hub 用 `useStorage('preferences-store', DEFAULT_PREFERENCES, localStorage, { mergeDefaults: true })`。

- [ ] **Step 1: 写测试，验证 localStorage 持久化**

```typescript
// apps/client/src/stores/modules/__tests__/preferences.spec.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePreferencesStore } from '@/stores/modules/preferences';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists theme mode change to localStorage', () => {
    const store = usePreferencesStore();
    store.setThemeMode();
    const persisted = localStorage.getItem('preferences-store');
    expect(persisted).toContain('"mode":"dark"');
  });

  it('restores from localStorage on re-init', () => {
    localStorage.setItem(
      'preferences-store',
      JSON.stringify({ theme: { mode: 'dark' } }),
    );
    setActivePinia(createPinia());
    const store = usePreferencesStore();
    expect(store.isDarkTheme).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，预期 FAIL**

- [ ] **Step 3: 修改 preferences.ts:25-26 + 移除 DeepPartial（用 lodash merge 已足够）**

替换 `apps/client/src/stores/modules/preferences.ts:21-31` 为：

```typescript
export const usePreferencesStore = defineStore('preferences-store', () => {
  const state = useStorage<Preferences>(
    'preferences-store',
    DEFAULT_PREFERENCES,
    localStorage,
    { mergeDefaults: true },
  );
  const { css } = useStyleTag('', { id: 'theme-vars' });

  const updatePreferences = (preferences: Partial<Preferences>) => {
    state.value = merge({}, state.value, preferences);
  };
```

注意：`useStorage` 已通过 Vue auto-import 暴露（项目使用 `@vueuse/core` auto-import）；如需显式 import：`import { useStorage, useStyleTag } from '@vueuse/core';`

同时修复 `setThemeMode`：暗黑模式应同步 `useDark()`。替换 56-60 行：

```typescript
  const setThemeMode = () => {
    const newMode = isDarkTheme.value ? 'light' : 'dark';
    updatePreferences({ theme: { mode: newMode } });
    useDark().value = newMode === 'dark';
  };
```

应用启动时同步 `useDark`（在 main.ts 或 App.vue 中）：

```typescript
// apps/client/src/App.vue setup 区域
const preferencesStore = usePreferencesStore();
useDark().value = preferencesStore.isDarkTheme;
```

- [ ] **Step 4: 运行测试，预期 PASS**

- [ ] **Step 5: 手动验证**：切换主题色/暗黑模式/语言 → F5 → 配置保留。

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/stores/modules/preferences.ts apps/client/src/App.vue apps/client/src/stores/modules/__tests__/preferences.spec.ts
git commit -m "fix(@sinopec-kb/client): 🐛 persist preferences to localStorage and sync useDark"
```

---

### Task P0-5: 修补 3 处空 catch 块

**Files:**
- Modify: `apps/client/src/composables/useSSEStream.ts:97-99`
- Modify: `apps/client/src/composables/useKnowledgeBaseOptions.ts:27-28`
- Modify: `apps/client/src/composables/useLlmOptions.ts:29-30`

**Background:** 三处 catch 块吞掉错误不打日志，问题排查困难。逐个修，每处加 `console.warn` + `import.meta.env.DEV` 守卫，避免生产环境噪音。

- [ ] **Step 1: 修 useSSEStream.ts:97-99**

替换：

```typescript
      } catch (parseError) {
        if (import.meta.env.DEV) {
          console.warn('[useSSEStream] failed to parse SSE line', parseError);
        }
      }
```

- [ ] **Step 2: 修 useKnowledgeBaseOptions.ts:27-29**

替换：

```typescript
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[useKnowledgeBaseOptions] fetch failed', error);
      }
      knowledgeBaseList.value = [];
    } finally {
```

- [ ] **Step 3: 修 useLlmOptions.ts:29-31**

替换：

```typescript
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[useLlmOptions] fetch failed', error);
      }
      llmList.value = [];
    } finally {
```

- [ ] **Step 4: 验证 typecheck + lint 通过**

Run: `pnpm -F @sinopec-kb/client typecheck && pnpm -F @sinopec-kb/client lint`
Expected: 0 errors / 0 warnings

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/composables/useSSEStream.ts apps/client/src/composables/useKnowledgeBaseOptions.ts apps/client/src/composables/useLlmOptions.ts
git commit -m "fix(@sinopec-kb/client): 🐛 log errors instead of silently swallowing in catch blocks"
```

---

## Phase P1：能力补齐（预估 5-8 天）

P1 阶段每个 task 引入一个独立能力，互不阻塞，可并行 PR。

### Task P1-1: 引入 `ApiError` 标识类

**Files:**
- Modify: `apps/client/src/utils/request.ts`（顶部追加 export class，错误抛出改用 ApiError）
- Test: `apps/client/src/utils/__tests__/request-api-error.spec.ts`

**Background:** 当前 `throw new Error(...)` 调用方无法区分"已弹过提示的错误"vs"新错误"。引入 `ApiError` 后：业务代码 `catch (e) { if (e instanceof ApiError) return; /* 兜底处理 */ }` 可避免重复弹窗。

- [ ] **Step 1: 写测试**

```typescript
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/utils/request';

describe('ApiError', () => {
  it('instanceof Error and ApiError', () => {
    const e = new ApiError('test');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.name).toBe('ApiError');
  });
});
```

- [ ] **Step 2: 在 request.ts 顶部 `UNPROTECTED_ROUTES` 之前追加**

```typescript
/**
 * API 错误类
 *
 * 标识由 request 拦截器处理过的错误（已通过 $message 展示提示）。
 * 调用方通过 `instanceof ApiError` 判断是否需要二次弹错。
 */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 3: 替换 request.ts:188、190 的 `throw new Error(...)` 为 `throw new ApiError(...)`**

- [ ] **Step 4: 全局搜索 `catch (` 模式，将"业务层不应再弹错"的调用点改为 `if (e instanceof ApiError) return;`**

Run: `pnpm -F @sinopec-kb/client grep -rn "window.\$message.error" src/views/ src/composables/`
对每个 catch 块判断：拦截器已弹过则直接 return。

- [ ] **Step 5: 测试 + commit**

```bash
git add apps/client/src/utils/request.ts apps/client/src/utils/__tests__/request-api-error.spec.ts
git commit -m "feat(@sinopec-kb/client): ✨ export ApiError class to dedupe error toasts"
```

---

### Task P1-2: 引入 `latest-request-guard` 工具

**Files:**
- Create: `apps/client/src/utils/latest-request-guard.ts`
- Test: `apps/client/src/utils/__tests__/latest-request-guard.spec.ts`

**Background:** 抽屉/弹窗/轮询场景下旧请求覆盖新请求结果。data-hub 已有现成实现，直接搬过来。

- [ ] **Step 1: 写测试**

```typescript
import { describe, expect, it } from 'vitest';
import { createLatestRequestGuard } from '@/utils/latest-request-guard';

describe('latest-request-guard', () => {
  it('isLatest returns true for last next() id', () => {
    const g = createLatestRequestGuard();
    const id1 = g.next();
    expect(g.isLatest(id1)).toBe(true);
  });

  it('isLatest returns false for stale id after invalidate', () => {
    const g = createLatestRequestGuard();
    const id1 = g.next();
    g.invalidate();
    expect(g.isLatest(id1)).toBe(false);
  });

  it('current() returns current id without incrementing', () => {
    const g = createLatestRequestGuard();
    g.next();
    const before = g.current();
    expect(g.current()).toBe(before);
  });
});
```

- [ ] **Step 2: 创建 apps/client/src/utils/latest-request-guard.ts，复制 data-hub 实现**

直接复制 `/root/code/data-hub/client/src/utils/latest-request-guard.ts` 全文（见已读取的源码），保持文件级 jsdoc 注释。

- [ ] **Step 3: 测试 + commit**

```bash
git add apps/client/src/utils/latest-request-guard.ts apps/client/src/utils/__tests__/latest-request-guard.spec.ts
git commit -m "feat(@sinopec-kb/client): ✨ add latest-request-guard for stale response prevention"
```

---

### Task P1-3: 引入 `format.ts` + `currency.ts` 数值格式化体系

**Files:**
- Create: `apps/client/src/utils/format.ts`（参考 `data-hub/client/src/utils/format.ts` 4KB）
- Create: `apps/client/src/utils/currency.ts`（参考 `data-hub/client/src/utils/currency.ts` 1.5KB）
- Test: `apps/client/src/utils/__tests__/format.spec.ts`

**Background:** 当前项目只有 24 行 `date.ts`，没有统一的 `fmtNumber / fmtRatio / fmtPercent / fmtCurrency` 体系，业务代码各写各的。

- [ ] **Step 1: 复制 data-hub 的 format.test.ts 作为测试**

直接复制 `/root/code/data-hub/client/src/utils/format.test.ts` 到 `apps/client/src/utils/__tests__/format.spec.ts`。

- [ ] **Step 2: 复制 format.ts + currency.ts 实现**

直接复制两个文件全文到 `apps/client/src/utils/`。

注意：检查依赖是否齐全。如果用到了 `numeral` / `accounting`：

Run: `pnpm -F @sinopec-kb/client add numeral` (按 data-hub package.json 决定)

- [ ] **Step 3: 测试 + commit**

```bash
git add apps/client/src/utils/format.ts apps/client/src/utils/currency.ts apps/client/src/utils/__tests__/format.spec.ts apps/client/package.json
git commit -m "feat(@sinopec-kb/client): ✨ port format/currency utils from data-hub"
```

---

### Task P1-4: 引入 `useFormLoading` + `useEditLoading` composables

**Files:**
- Create: `apps/client/src/composables/useFormLoading.ts`
- Create: `apps/client/src/composables/useEditLoading.ts`

**Background:** 表单/编辑页 try-catch-finally 模板每个页面手写，且需要区分 `ApiError`（已弹过）vs 其他错误。data-hub 已封装。

- [ ] **Step 1: 复制 data-hub 实现**

从 `/root/code/data-hub/client/src/composables/useFormLoading.ts` 和 `useEditLoading.ts` 复制全文到 `apps/client/src/composables/`。

注意：依赖项目 P1-1 的 `ApiError` 类已就绪。

- [ ] **Step 2: 写 1 个集成测试覆盖 happy path + ApiError 跳过 + 通用错误兜底**

```typescript
// apps/client/src/composables/__tests__/useFormLoading.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { useFormLoading } from '@/composables/useFormLoading';
import { ApiError } from '@/utils/request';

describe('useFormLoading', () => {
  it('sets loading true during submit, false after success', async () => {
    const { loading, withLoading } = useFormLoading();
    expect(loading.value).toBe(false);
    const p = withLoading(async () => 'ok');
    expect(loading.value).toBe(true);
    await p;
    expect(loading.value).toBe(false);
  });

  it('does not rethrow ApiError (already handled by interceptor)', async () => {
    const { withLoading } = useFormLoading();
    await expect(
      withLoading(async () => { throw new ApiError('handled'); })
    ).resolves.toBeUndefined();
  });

  it('rethrows non-ApiError', async () => {
    const { withLoading } = useFormLoading();
    await expect(
      withLoading(async () => { throw new Error('unhandled'); })
    ).rejects.toThrow('unhandled');
  });
});
```

- [ ] **Step 3: 测试 + commit**

```bash
git add apps/client/src/composables/useFormLoading.ts apps/client/src/composables/useEditLoading.ts apps/client/src/composables/__tests__/useFormLoading.spec.ts
git commit -m "feat(@sinopec-kb/client): ✨ port useFormLoading/useEditLoading from data-hub"
```

---

### Task P1-5: 路由降级 `getFirstAccessibleMenu()`

**Files:**
- Modify: `apps/client/src/stores/modules/user.ts`（新增 getter）
- Modify: `apps/client/src/router/permissionGuard.ts:113-114`

**Background:** 当前用户访问默认首页 `/` 时，若该路径无权限直接跳 `/403`，UX 差。应自动选侧栏第一个可访问菜单。

- [ ] **Step 1: 在 user store 新增 `getFirstAccessibleMenu()` getter**

参考 `data-hub/client/src/stores/modules/user.ts:69-87`，按其菜单数据结构在 user store 末尾追加：

```typescript
function getFirstAccessibleMenu(): null | string {
  function findFirst(menus: Menu[]): null | string {
    for (const menu of menus) {
      if (menu.children?.length) {
        const found = findFirst(menu.children);
        if (found) return found;
      } else if (menu.path && !menu.meta?.hidden) {
        return menu.path;
      }
    }
    return null;
  }
  return findFirst(menuList.value);
}
// 在 return 块加入 getFirstAccessibleMenu
```

- [ ] **Step 2: 修改 permissionGuard.ts:113-114**

```typescript
    // 如果没有访问权限，则尝试降级到首个可访问菜单
    if (!userStore.hasAccess(to.path)) {
      const fallback = userStore.getFirstAccessibleMenu();
      if (fallback && fallback !== to.path) {
        return { path: fallback, replace: true };
      }
      return { path: '/403', replace: true };
    }
```

- [ ] **Step 3: 加测试 + 手动验证**：用一个没有默认首页权限的角色登录，应跳到侧栏第一个可见菜单而非 403。

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/stores/modules/user.ts apps/client/src/router/permissionGuard.ts
git commit -m "feat(@sinopec-kb/client): ✨ fallback to first accessible menu instead of 403"
```

---

### Task P1-6: 升级 `TableAction` 组件支持 dropdown + 二次确认

**Files:**
- Modify: `apps/client/src/components/common/TableAction/index.vue`（132 行 → 201 行）
- 参考实现：`/root/code/data-hub/client/src/components/common/TableAction/`

**Background:** 当前 TableAction 仅支持单个 button list，不支持"更多操作"下拉，也不支持 `dialog.warning` 二次确认。

- [ ] **Step 1: 阅读 data-hub TableAction 完整实现**

Run: `cat /root/code/data-hub/client/src/components/common/TableAction/index.vue`

- [ ] **Step 2: 将 dropdown / DropdownActionItem interface / 二次确认逻辑迁入**

新增 prop：`dropdownActions?: DropdownActionItem[]` 和 `confirm?: { title: string; content: string }`。

导出 interface：

```typescript
export interface TableActionItem {
  label: string;
  icon?: string;
  type?: 'primary' | 'error' | 'warning' | 'success';
  show?: boolean | (() => boolean);
  disabled?: boolean | (() => boolean);
  confirm?: { title: string; content: string };
  onClick?: () => void | Promise<void>;
}

export interface DropdownActionItem extends TableActionItem {
  key: string;
}
```

二次确认通过 `useDialog()` 触发：

```typescript
const dialog = useDialog();
async function handleClick(action: TableActionItem) {
  if (action.confirm) {
    dialog.warning({
      ...action.confirm,
      positiveText: $t('common.confirm'),
      negativeText: $t('common.cancel'),
      onPositiveClick: () => action.onClick?.(),
    });
    return;
  }
  await action.onClick?.();
}
```

- [ ] **Step 3: 写组件测试覆盖 dropdown 渲染 + confirm dialog 触发**

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/common/TableAction/
git commit -m "feat(@sinopec-kb/client): ✨ add dropdown menu and confirm dialog to TableAction"
```

---

### Task P1-7: 引入 `useVersionCheck` 版本更新提示

**Files:**
- Create: `apps/client/src/composables/useVersionCheck/index.ts`
- Create: `apps/client/src/composables/useVersionCheck/leader-election.ts`（若 data-hub 有该模式）
- Modify: `apps/client/src/App.vue`（启动时挂载）

**Background:** 用户长期不刷新拿不到新版本。data-hub 通过定期拉 `index.html` 比对 hash 实现。

- [ ] **Step 1: 阅读 data-hub useVersionCheck 完整目录**

Run: `ls /root/code/data-hub/client/src/composables/useVersionCheck/ && cat /root/code/data-hub/client/src/composables/useVersionCheck/*.ts`

- [ ] **Step 2: 复制整个目录到 apps/client/src/composables/useVersionCheck/**

- [ ] **Step 3: 在 App.vue setup 中挂载**

```vue
<script setup lang="ts">
import { useVersionCheck } from '@/composables/useVersionCheck';
useVersionCheck();
</script>
```

- [ ] **Step 4: 手动验证**：build 一次 → 改源码 → 再 build → 访问站点等待轮询周期，应出现"新版本可用"提示。

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/composables/useVersionCheck/ apps/client/src/App.vue
git commit -m "feat(@sinopec-kb/client): ✨ add version check with update prompt"
```

---

### Task P1-8: 多页签 LayoutTabs（最大块，可拆分子 task）

**Files:**
- Create: `apps/client/src/layouts/components/LayoutTabs.vue`（15KB）
- Create: `apps/client/src/layouts/composables/useTabDragSort.ts`
- Create: `apps/client/src/layouts/composables/useTabContextMenu.ts`
- Create: `apps/client/src/layouts/composables/useTabScroll.ts`
- Create: `apps/client/src/layouts/composables/useTabOverflow.ts`
- Modify: `apps/client/src/layouts/MainLayout.vue`（接入 LayoutTabs）
- Modify: `apps/client/src/stores/modules/tabbar.ts`（按 data-hub async 化方法）

**Background:** 当前项目无多页签，重度后台用户体验差。data-hub 已实现完整方案。

**子 task 拆分：**

- [ ] **P1-8a: 移植 4 个 composables**

Run: `cp /root/code/data-hub/client/src/layouts/composables/*.ts apps/client/src/layouts/composables/`
逐文件检查 import 路径调整、菜单数据结构是否一致；测试编译通过。

- [ ] **P1-8b: 移植 tabbar.ts store（async 化 updateCacheTabs/sortTabs）**

对比 data-hub 与项目 A 的 tabbar.ts，把所有"同步缓存更新"方法 async 化（避免竞态）。

- [ ] **P1-8c: 移植 LayoutTabs.vue**

Run: `cp /root/code/data-hub/client/src/layouts/components/LayoutTabs.vue apps/client/src/layouts/components/`
调整 import / i18n key / styles，确保 UnoCSS 类名生效。

- [ ] **P1-8d: 接入 MainLayout，开关由 preferences 控制**

在 `preferences.ts` 增 `tabbar.enable` 字段；MainLayout 根据 flag 渲染 LayoutTabs。

- [ ] **P1-8e: E2E 测试**

`apps/client/e2e/layout-tabs.spec.ts`：覆盖打开多 tab、关闭、右键菜单、拖拽排序。

- [ ] **每个子 task 独立 commit**：

```bash
git commit -m "feat(@sinopec-kb/client): ✨ port LayoutTabs composables from data-hub"
git commit -m "refactor(@sinopec-kb/client): ♻️ async-ify tabbar store mutations"
git commit -m "feat(@sinopec-kb/client): ✨ port LayoutTabs.vue with drag/contextmenu/scroll"
git commit -m "feat(@sinopec-kb/client): ✨ wire LayoutTabs into MainLayout"
git commit -m "test(@sinopec-kb/client): ✅ add E2E for multi-tab navigation"
```

---

## Phase P2：清理与可选优化（预估 1-2 天）

P2 阶段都是小修小补，1-2 commit 可完成。

### Task P2-1: 修 `useDateRangeShortcuts` maxDate 计算错误

**Files:**
- Modify: `apps/client/src/composables/useDateRangeShortcuts.ts:47-48`

**Background:** 当前 L47-48 使用 `dayjs().subtract()` 而非 `getMaxDate().subtract()`，导致设置 `disableDays` 且 `maxRangeDays` 时上限计算错误。

- [ ] **Step 1: 写测试覆盖 maxRangeDays 边界**

- [ ] **Step 2: 把 47-48 行的 `dayjs()` 改为 `getMaxDate()`**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(@sinopec-kb/client): 🐛 useDateRangeShortcuts uses maxDate as base for subtract"
```

---

### Task P2-2: 修 `download.ts` iOS 分支缺 return

**Files:**
- Modify: `apps/client/src/utils/download.ts:27-29`

**Background:** L27-29 检查 `/iP/` (iPad/iPhone) 后逻辑应直接 return，当前会继续走桌面流程导致重复下载/异常。

- [ ] **Step 1: 在 iOS 分支末尾加 return**
- [ ] **Step 2: Commit**：`fix(@sinopec-kb/client): 🐛 download.ts ios branch should short-circuit`

---

### Task P2-3: i18n.ts:129 console.warn 仅 DEV 输出

**Files:**
- Modify: `apps/client/src/locales/i18n.ts:129`

```typescript
if (import.meta.env.DEV) {
  console.warn(`[i18n] missing key: ${key}`);
}
```

- [ ] **Commit**：`chore(@sinopec-kb/client): 🔨 gate i18n missing-key warning behind DEV flag`

---

### Task P2-4: 删除未被引用的 `UnderConstruction.vue` 和验证 `Permission/index.vue`

**Files:**
- Delete (or verify): `apps/client/src/components/common/UnderConstruction.vue`
- Verify: `apps/client/src/components/common/Permission/index.vue`

- [ ] **Step 1: 全局搜索引用**

Run: `pnpm -F @sinopec-kb/client grep -rn "UnderConstruction\|components/common/Permission" src/`

- [ ] **Step 2: 无引用则 git rm**
- [ ] **Step 3: 跑 typecheck 与 knip**

Run: `pnpm -F @sinopec-kb/client typecheck && pnpm check`

- [ ] **Step 4: Commit**：`chore(@sinopec-kb/client): 🔨 remove unused UnderConstruction component`

---

### Task P2-5: 修 `utils/index.ts` 中 tsx-helper 导出路径

**Files:**
- Modify: `apps/client/src/utils/index.ts`

**Background:** `index.ts` 导出 `./tsx-helper`，但文件实际是 `.tsx`。改为显式 `./tsx-helper.tsx` 或保持 `.ts` 扩展但 rename 文件以匹配。

- [ ] **Step 1: 决策**（rename 文件 vs 改 import）
- [ ] **Step 2: 跑 typecheck 验证**
- [ ] **Step 3: Commit**：`fix(@sinopec-kb/client): 🐛 align tsx-helper export path with actual extension`

---

### Task P2-6（可选）：OpenAPI 按模块拆分

**Files:**
- Modify: `apps/client/types/`（拆 openapi.d.ts → 多个 openapi-{module}.d.ts）
- Modify: `apps/client/src/utils/request.ts:1`（types 改为 intersection）
- Modify: `apps/server` 的 swagger 模块路由生成（前置依赖）

**Background:** A 当前一个 `openapi.d.ts`，所有页面都加载完整 spec；B 按 NestJS feature module 拆 7 份，按需 tree-shake。

> ⚠️ 此 task 需要先在 server 侧暴露分模块 swagger json，跨前后端协调，建议作为独立 issue 推进，不在本路线图强制完成。

- [ ] **Step 1: 在 server 侧新增 `/doc-json/{module}` 路由**
- [ ] **Step 2: client 侧 openapi 脚本改为遍历模块拉取**
- [ ] **Step 3: 验证 bundle size 减少**
- [ ] **Step 4: Commit**

---

## 收尾清单

完成所有 P0+P1 后：

- [ ] 运行 `pnpm -F @sinopec-kb/client test`（vitest 全量）
- [ ] 运行 `pnpm -F @sinopec-kb/client test:e2e`（Playwright）
- [ ] 运行 `pnpm check`（knip + typecheck + cspell）
- [ ] 用 P0 列表的"手动验证"步骤全部走一遍（token 刷新 / 改密 401 / preferences 持久化 / sse 错误日志）
- [ ] 用 P1 列表的"手动验证"步骤全部走一遍（首页降级 / 多页签 / 版本更新提示 / TableAction 二次确认）
- [ ] 更新 `docs/kb-optimization-report.md` 标注本路线图完成时间

---

## 优先级与时间预估

| 阶段 | Task 数 | 预估工时 | 备注 |
|------|---------|---------|------|
| P0   | 5       | 2-3 天  | 紧急修复，独立 PR 上线 |
| P1   | 8       | 5-8 天  | LayoutTabs 占大头（3 天） |
| P2   | 6       | 1-2 天  | P2-6 跨前后端，可单独立项 |
| **总计** | **19** | **8-13 天** | 单人推进；并行可压缩到 1 周 |
