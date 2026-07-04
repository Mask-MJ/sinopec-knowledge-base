---
'@sinopec-kb/client': patch
---

fix: 修复首次登录后左侧菜单不渲染、需手动刷新才出现

- 权限守卫在初始化菜单（`fetchMenuList` 异步填充 `accessMenus`）后，被提交 `f2167bb` 从「权限就绪后重新发起一次导航」改成了 `return true` 沿用首次导航。导致依赖权限状态的侧栏菜单在状态就绪前就完成挂载、之后不再更新，只有整页刷新才恢复。恢复为 `return { ...to, replace: true }`（二次导航时 `isAccessChecked` 已为 true，提前放行，不会死循环），对齐 data-hub/client 的实现。
- 全局搜索面板（Ctrl+K）的 `searchItems` 从 `onMounted` 一次性赋值改为 `computed` 响应式派生，菜单异步到达后搜索项也能更新。
