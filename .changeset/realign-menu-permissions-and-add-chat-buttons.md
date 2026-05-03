---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 数据迁移补齐已部署环境的菜单权限

`0659c56` 把 SEED_MENUS 与 `@AutoPermission()` 自动生成规则对齐，但 `seedInitialIfEmpty` 仅在空库时才灌入 SEED_MENUS，`syncCommonRolePermissions` 也仅"按 permission 字段查找现有 menu 再 connect"。已部署环境（路径 `Menu.permission` 仍是 `document:upload` / `assistant:create` 等旧字符串，且缺少 5 个 `/dashboard/chat` 子按钮 + 4 个 `/assistant` 会话按钮 + 1 个知识库检索按钮）因此完全没被修复，普通用户调任何 `@AutoPermission()` 接口仍 403。

本次新增 data migration `20260503211139_realign_menu_permissions_and_add_chat_buttons`：

- UPDATE 旧 permission 字符串至 AutoPermission 格式（`document:*` → `knowledge-base:documents:*` / `knowledge-base:parse:*`）。
- 兼容 pre-e4d5313 部署，把残留的 `/dashboard/map` 改写为 `/dashboard/chat`。
- INSERT 缺失的 button menu：知识库检索 1 条、`/assistant` 会话/对话 4 条、`/dashboard/chat` 通用助手 5 条；全部 `WHERE NOT EXISTS` 幂等。
- 直接在 migration 中 connect 到 common 角色，避免 `migrate deploy` 与下次 app 启动之间的 403 窗口。
