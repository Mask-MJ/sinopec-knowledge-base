---
description: Git 提交工作流 — 当用户要求提交代码时遵循此流程
---

# Git Workflow

当用户要求提交代码（如 `/git`、"帮我提交"、"commit" 等），严格按以下流程执行。

## 1. 提交规范

### Format

```
type(scope): subject
```

- **Header ≤ 108 字符**
- **Subject 使用英文**，首字母小写，不加句号
- Body 可选，需与 header 空一行

### Types

| Type       | 用途      | SemVer |
| :--------- | :-------- | :----- |
| `feat`     | 新功能    | minor  |
| `fix`      | 修复 Bug  | patch  |
| `refactor` | 重构      | -      |
| `perf`     | 性能优化  | patch  |
| `chore`    | 构建/依赖 | -      |
| `docs`     | 文档      | -      |
| `test`     | 测试      | -      |
| `style`    | 格式调整  | -      |
| `build`    | 构建系统  | -      |
| `ci`       | CI/CD     | -      |
| `revert`   | 回滚      | -      |
| `types`    | 类型定义  | -      |
| `release`  | 发布      | -      |

### Scopes

按影响的包选择：`@sinopec-kb/server`、`@sinopec-kb/client`、`@sinopec-kb/eslint-config`、`@sinopec-kb/prettier-config`、`@sinopec-kb/commitlint-config`

通用 scope：`project`、`lint`、`ci`、`dev`、`deploy`、`other`

> 如果只影响单个 app，可简写为 `server` / `client`。

## 2. 提交流程

// turbo-all

> **⚠️ 严格规则：禁止直接在 `main` 分支上提交。所有变更必须通过 feature 分支 → PR → 合并到 main。**

### Step 0: 确保在 feature 分支上

```bash
git branch --show-current
```

如果当前在 `main` 分支，**必须先创建 feature 分支**：

```bash
git checkout -b feature/xxx  # 或 fix/xxx、refactor/xxx
```

分支命名规则见 **Section 4**。

### Step 1: 检查状态

```bash
git status
git diff --staged --stat
```

确认有已暂存的变更。如果没有暂存文件，先执行 `git add` 暂存相关文件。

### Step 2: 分析变更，确定 type 和 scope

根据 `git diff --staged` 的内容：

1. **Type 判定优先级**：feat > fix > refactor > perf > test > docs > chore
2. **Scope 判定**：看变更文件路径
   - `apps/server/` → `server`
   - `apps/client/` → `client`
   - `internal/` → 对应包名
   - 多个包 → `project`
3. **Mixed Changes**：如果变更跨 type，拆分为多次 atomic commit

### Step 3: 生成 commit message 并提交

```bash
git commit -m "type(scope): subject"
```

**规则**：

- 不使用 `--no-verify`（lefthook 会运行 commitlint 校验）
- 如果 commitlint 校验失败，根据错误信息修正 message 后重新提交

### Step 4: 推送并创建 PR

```bash
git push origin <branch>
```

推送后，**提醒用户去 GitHub 创建 PR 合并到 `main`**。

## 3. Atomic Split（拆分提交）

当变更涉及不同类型时，拆分为多次 commit：

```bash
# 例：同时有功能代码和配置变更
git add apps/server/src/
git commit -m "feat(server): add user management module"

git add internal/ package.json pnpm-lock.yaml
git commit -m "chore(project): update dependencies"
```

**拆分原则**：

- 功能代码 vs 配置/依赖 → 分开
- 不同模块的独立功能 → 分开
- 同一功能的代码 + 测试 → 可合并

## 4. 分支策略

> **所有变更必须走 feature 分支 → PR → 合并到 main，禁止直接推送 main。**

| 分支           | 用途               |
| :------------- | :----------------- |
| `main`         | 生产分支（受保护） |
| `feature/xxx`  | 新功能             |
| `fix/xxx`      | Bug 修复           |
| `refactor/xxx` | 重构               |
| `chore/xxx`    | 配置/依赖更新      |

### 完整流程

```
1. git checkout main && git pull origin main
2. git checkout -b feature/xxx
3. (开发 + commit)
4. git push origin feature/xxx
5. GitHub 创建 PR → Review → Merge to main
6. git checkout main && git pull origin main
7. git branch -d feature/xxx
```
