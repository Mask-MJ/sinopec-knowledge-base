# Daily Development Workflow

The complete daily loop: classify changes → decide path → commit → push.

## Step 1: Classify Changes

### Classification Matrix

| Type         | File Patterns                                  | Diff Patterns                                 | Keywords                                   |
| :----------- | :--------------------------------------------- | :-------------------------------------------- | :----------------------------------------- |
| **feat**     | New files in `src/modules/`, `src/components/` | `export class`, `export function`, new routes | add, new, implement, create                |
| **fix**      | Modified files, error handlers                 | `catch`, `throw`, `try`, condition changes    | fix, bug, issue, error, resolve            |
| **refactor** | Renamed/moved files                            | No behavior change, same tests pass           | refactor, restructure, reorganize, extract |
| **perf**     | Any source files                               | Caching, indexing, batch operations           | perf, performance, optimize, cache         |
| **docs**     | `*.md`, `README`, `CHANGELOG`                  | Comments, JSDoc                               | docs, document, readme                     |
| **test**     | `*.spec.ts`, `*.test.ts`, `__tests__/`         | `describe`, `it`, `expect`                    | test, spec, coverage                       |
| **chore**    | `*.config.*`, `package.json`, `.env*`          | Dependencies, scripts                         | chore, deps, build                         |
| **style**    | Any source files                               | Whitespace, formatting only                   | style, format, lint                        |
| **ci**       | `.github/`, `.gitea/`, CI config files         | Pipeline, workflow, action changes            | ci, pipeline, workflow, action             |
| **revert**   | Any files                                      | Reverts previous commit                       | revert, undo, rollback                     |

### Detection Algorithm

```
Priority (highest → lowest):
1. File extension/path match
2. Diff content analysis
3. Commit message keywords
4. Default to 'chore' if uncertain
```

```bash
# Get changed files
git diff --name-only HEAD~1

# Pattern matching:
*.spec.ts, *.test.ts           → test
*.md, README*, CHANGELOG*      → docs
*.config.*, package.json       → chore
.github/*, .gitea/*            → ci
prisma/migrations/*            → chore
src/modules/**/new-file.ts     → feat (if new)
```

### Mixed Changes

When changes span multiple types:

1. **Primary Rule**: Choose the type with the greatest user impact
2. **Priority**: feat > fix > refactor > others
3. **Consider splitting** into multiple commits/PRs

| Scenario                 | Recommendation                     |
| :----------------------- | :--------------------------------- |
| New feature + its tests  | `feat` (tests are part of feature) |
| Bug fix + refactor       | `fix` (primary purpose)            |
| Refactor + style changes | `refactor` (style is incidental)   |
| Config + new feature     | Split into 2 commits               |

---

## Step 2: Decide Workflow Path

### Does this change need a branch?

| Type                          | Example                          | Branch? |
| :---------------------------- | :------------------------------- | :------ |
| `docs` — Documentation        | Update README, add comments      | ❌ No   |
| `style` — Formatting          | Fix indentation, lint fixes      | ❌ No   |
| `chore` — Config/deps         | Update `.env.example`, bump deps | ❌ No   |
| `fix` — Trivial fix (<10 LOC) | Fix typo in error message        | ❌ No   |
| `feat` — New feature          | Add new API endpoint             | ✅ Yes  |
| `fix` — Non-trivial fix       | Fix auth flow, complex bug       | ✅ Yes  |
| `refactor` — Restructuring    | Extract service, rename module   | ✅ Yes  |
| `perf` — Performance          | Add caching, optimize queries    | ✅ Yes  |

> ⚠️ **Rule of thumb**: If it touches business logic or could break existing behavior, create a branch.

> [!CAUTION]
> **No exceptions**: If the table says "✅ Yes", you MUST create a branch — even if you are already on `develop` with uncommitted or ahead commits. Stash or carry changes to the new branch. Never rationalize a direct commit on `develop` for branch-required changes.

### Path A: Direct Commit on Develop

```bash
git checkout develop
git pull origin develop
# ... make changes ...
git add .
pnpm commit
git push origin develop
```

### Path B: Feature Branch

```bash
# 1. Start from latest develop
git checkout develop
git pull origin develop

# 2. Create branch
git checkout -b <type>/<description>

# Examples:
git checkout -b feature/user-profile
git checkout -b fix/123-login-timeout
git checkout -b refactor/extract-utils
```

#### Branch Naming

| Rule              | ✅ Correct                 | ❌ Incorrect                                                     |
| :---------------- | :------------------------- | :--------------------------------------------------------------- |
| Lowercase only    | `feature/user-auth`        | `Feature/UserAuth`                                               |
| Hyphen separators | `fix/login-timeout`        | `fix/login_timeout`                                              |
| No special chars  | `docs/api-guide`           | `docs/api@guide`                                                 |
| Max 50 chars      | `feature/add-payment`      | `feature/add-payment-gateway-integration-with-stripe-and-paypal` |
| Descriptive       | `fix/null-pointer-in-auth` | `fix/bug`                                                        |

#### Branch Prefixes

| Prefix      | When to Use                          |
| :---------- | :----------------------------------- |
| `feature/`  | Adding new functionality             |
| `fix/`      | Fixing bugs or errors                |
| `refactor/` | Code changes without behavior change |
| `docs/`     | Documentation only changes           |
| `test/`     | Adding or updating tests             |
| `chore/`    | Build, deps, config changes          |
| `perf/`     | Performance improvements             |
| `style/`    | Code formatting changes              |
| `release/`  | Version release preparation          |
| `hotfix/`   | Urgent production fixes              |

---

## Step 3: Commit

### Conventional Commits Format

```
<type>(<scope>): <emoji> <subject>

[optional body]

[optional footer(s)]
```

> Emoji is **mandatory** for all commits (both human and AI). See the emoji mapping below.

### Types with Emoji and SemVer Impact

> Source of truth: `.commitlintrc.mjs` — `prompt.types` + `rules.type-enum`

| Type       | Emoji | Description                                                   | SemVer Impact |
| :--------- | :---- | :------------------------------------------------------------ | :------------ |
| `feat`     | ✨    | A new feature                                                 | MINOR         |
| `fix`      | 🐛    | A bug fix                                                     | PATCH         |
| `docs`     | 📝    | Documentation only changes                                    | —             |
| `style`    | 💄    | Changes that do not affect the meaning of the code            | —             |
| `refactor` | ♻️    | A code change that neither fixes a bug nor adds a feature     | PATCH         |
| `perf`     | ⚡️    | A code change that improves performance                       | PATCH         |
| `test`     | ✅    | Adding missing tests or correcting existing tests             | —             |
| `build`    | 📦️    | Changes that affect the build system or external dependencies | —             |
| `ci`       | 🎡    | Changes to our CI configuration files and scripts             | —             |
| `chore`    | 🔨    | Other changes that don't modify src or test files             | —             |
| `revert`   | ⏪️    | Reverts a previous commit                                     | varies        |
| `wip`      | 🚧    | Work in progress                                              | —             |
| `workflow` | 📋    | Workflow changes                                              | —             |
| `types`    | 🏷️    | Type definition changes                                       | —             |
| `release`  | 🔖    | Release version                                               | —             |

### Project-Specific Scopes

| Scope        | Module           |
| :----------- | :--------------- |
| `auth`       | Authentication   |
| `shop`       | Shop management  |
| `order`      | Order processing |
| `video`      | Video analytics  |
| `task`       | Task scheduling  |
| `erp`        | ERP integration  |
| `statistics` | Reporting        |
| `prisma`     | Database         |
| `skills`     | Agent skills     |
| `deps`       | Dependencies     |
| `ci`         | CI/CD            |

### Subject Rules

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at end
- Header max length: 108 characters (per `header-max-length` rule)

| ✅ Good                   | ❌ Bad                       |
| :------------------------ | :--------------------------- |
| `add user authentication` | `Added user authentication.` |
| `fix token refresh bug`   | `Fixes the bug with tokens`  |
| `update prisma to v7`     | `Updated Prisma`             |

### Body

Use body for:

- Explaining WHAT changed and WHY (code shows HOW)
- Context for complex changes
- Links to related issues or docs

```
type(scope): subject

- [Component]: Detail about this component change
- [Component]: Another detail

This change was necessary because...
```

### Footer Patterns

**Breaking Changes:**

```
feat(api)!: change response format

BREAKING CHANGE: Response now returns `data` wrapper object.
Migration: Update all API consumers to access `response.data`.
```

**Issue References:**

```
fix(auth): resolve token expiration issue

Fixes #123
Closes #456
```

### Commit Tool

> ⚠️ **All commit messages MUST be written in English** for consistent changelog generation.

#### For Humans (Interactive TTY)

```bash
pnpm commit  # Runs git-cz (Commitizen) — interactive prompts
```

`pnpm commit` launches an interactive wizard that guides you through type, scope, subject, body, and footer. This is the **preferred** method when working in a terminal.

#### For AI Agents (Non-Interactive)

`pnpm commit` (git-cz) requires an interactive TTY and cannot be driven by piped input. AI agents MUST use `git commit -m` directly, with the **same emoji format** as cz-git:

```bash
git commit -m "type(scope): <emoji> subject

- body line 1
- body line 2"
```

**Examples:**

```bash
git commit -m "feat(auth): ✨ add OAuth2 login support"
git commit -m "fix(order): 🐛 resolve null pointer in payment flow"
git commit -m "docs: 📝 update API reference"
git commit -m "chore(deps): 🔨 bump prisma to v7.3"
```

This still triggers **Husky `commit-msg` hook → commitlint** validation, which is the actual enforcement layer. The commit will be rejected if the format is invalid.

#### Validation Stack

```
pnpm commit (git-cz)  ─┐
                        ├─→ Husky commit-msg hook → commitlint ✓
git commit -m "..."   ─┘
```

Both paths are validated by the same commitlint rules. `git-cz` adds convenience (interactive prompts), but commitlint is the gatekeeper.

### Amend Last Commit

```bash
# Only if not pushed!
git commit --amend -m "type(scope): corrected subject"
```

---

## Step 4: Push

```bash
# Direct commit on develop
git push origin develop

# Feature branch
git push origin <type>/<description>
```

After pushing a branch → proceed to `review.md` for PR creation.

---

## End-to-End Examples

### Example 1: Documentation Fix (Direct Commit)

```bash
git checkout develop && git pull origin develop
# Edit README.md
git add README.md
pnpm commit
# Select: docs, scope: (empty), subject: "update deployment instructions"
git push origin develop
```

### Example 2: New Feature (Branch + PR)

```bash
git checkout develop && git pull origin develop
git checkout -b feature/user-profile-api
# Implement feature...
git add .
pnpm commit
# Select: feat, scope: erp, subject: "add user profile endpoint"
pnpm changeset  # Required — this impacts version
git add .
pnpm commit
# Select: chore, subject: "add changeset"
git push origin feature/user-profile-api
# → Proceed to review.md for PR creation
```

### Example 3: Bug Fix (Branch + PR)

```bash
git checkout develop && git pull origin develop
git checkout -b fix/123-token-expiry
# Fix the bug...
git add .
pnpm commit
# Select: fix, scope: auth, subject: "resolve token expiration issue"
# Body: "Fixes #123"
git push origin fix/123-token-expiry
# → Proceed to review.md for PR creation
```
