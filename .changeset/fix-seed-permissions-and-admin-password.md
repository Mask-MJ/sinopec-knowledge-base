---
'@sinopec-kb/server': patch
---

fix(@sinopec-kb/server): 修复 seed 权限体系与 admin 默认弱密码

- SEED_MENUS 中的按钮权限码全部对齐 `@AutoPermission()` 自动生成规则（`<module>:<resource>:<action>`），新增通用助手相关权限（`assistant:general:create`、`assistant:completions:create`、`assistant:sessions:*`），解决"知识库无法切片/多文件无法上传/聊天助手无法调用知识库/通用聊天无法使用"等普通用户 403 问题。
- 新增 `syncCommonRolePermissions` 幂等同步：每次启动把 dashboard/知识库/聊天助手菜单挂到 common 角色，已部署环境自动修复"新建普通用户登录后无任何权限"。
- admin 默认密码改为运行时哈希 `Admin@123`（大小写+数字+符号），`upgradeLegacyAdminPassword` 仅在密码 hash 仍为旧弱密码时升级，已自行改过密码的环境不会被覆盖。
