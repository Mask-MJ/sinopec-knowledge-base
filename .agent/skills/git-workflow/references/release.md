# Release Management

Version release workflow and Semantic Versioning specification.

## Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH
  │     │     └── Bug fixes (backward compatible)
  │     └──────── New features (backward compatible)
  └────────────── Breaking changes
```

### Version Bump Rules

| Change Type              | Version Bump  | Example       |
| :----------------------- | :------------ | :------------ |
| Breaking API change      | MAJOR         | 1.0.0 → 2.0.0 |
| New feature (compatible) | MINOR         | 1.0.0 → 1.1.0 |
| Bug fix                  | PATCH         | 1.0.0 → 1.0.1 |
| Chore/docs/style         | PATCH or none | —             |

## Pre-Release Checklist

- [ ] All tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Security audit passes (`pnpm audit --production`)
- [ ] CHANGELOG.md is updated
- [ ] Version is correctly incremented
- [ ] No uncommitted changes
- [ ] Branch is up to date with remote

## Release Procedure

### 1. Prepare

```bash
git checkout develop
git pull origin develop
git status  # Should show "nothing to commit"

pnpm test && pnpm build && pnpm lint
pnpm audit --production
```

### 2. Consume Changesets

```bash
pnpm changeset:version

# Review generated changes
git diff
```

### 3. Commit Release

```bash
git add .
git commit -m "chore(release): v1.7.0"
```

### 4. Push to Develop

```bash
git push origin develop
```

### 5. Merge to Main

```bash
git checkout main
git pull origin main
git merge develop --no-ff
git push origin main
```

### 6. Tag on Main

> ⚠️ Tags MUST be created on the `main` branch to ensure they point to production code.

```bash
git checkout main

git tag -a v1.7.0 -m "v1.7.0 - Feature description

✨ New Features:
- Feature 1 description
- Feature 2 description

🐛 Bug Fixes:
- Fix 1 description

♻️ Refactoring:
- Refactor description

📝 Documentation:
- Docs update

⚠️ Breaking Changes:
- Breaking change description (if any)"

git push origin v1.7.0
```

## Changelog Format

```markdown
# Changelog

## [1.7.0] - 2026-02-04

### ✨ Added

- New feature description (#123)

### 🐛 Fixed

- Bug fix description (#456)

### ♻️ Changed

- Refactoring description

### ⚠️ Breaking Changes

- API change description

### 📝 Documentation

- Docs update

### 🔧 Chore

- Dependency updates
```

### Tag Emojis

| Emoji | Category         |
| :---- | :--------------- |
| ✨    | New features     |
| 🐛    | Bug fixes        |
| ♻️    | Refactoring      |
| ⚡    | Performance      |
| 📝    | Documentation    |
| 🔧    | Configuration    |
| ⚠️    | Breaking changes |
| 🔒    | Security         |

## Hotfix Process

For urgent production fixes:

```bash
# Branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# Fix, test, commit
git add .
pnpm commit
# Select: fix, scope: ..., subject: "critical security patch"

# Merge to main
git checkout main
git merge --no-ff hotfix/critical-bug

# Tag as patch version
git tag -a v1.7.1 -m "v1.7.1 - Critical security fix"
git push origin main
git push origin v1.7.1

# Merge back to develop
git checkout develop
git merge main
git push origin develop

# Cleanup
git branch -d hotfix/critical-bug
```

## Troubleshooting

### Tag Already Exists

```bash
git tag -d v1.7.0
git push origin --delete v1.7.0
git tag -a v1.7.0 -m "v1.7.0 - Description"
git push origin v1.7.0
```

### Changeset Version Failed

```bash
git add package.json CHANGELOG.md .changeset/
git commit -m "chore(release): v1.7.0"
```

### Wrong Version Released

```bash
# If not yet pushed to main:
git tag -d v1.7.0
git reset --soft HEAD~1
# Fix version, re-commit, re-tag

# If already pushed:
# Create new patch version with fix
```

### Forgot Changelog Entry

```bash
# Amend last commit (if not pushed)
git add CHANGELOG.md
git commit --amend --no-edit

# Update tag
git tag -d v1.7.0
git tag -a v1.7.0 -m "v1.7.0 - Updated description"
```

## Available Commands

| Command                   | Purpose                          |
| :------------------------ | :------------------------------- |
| `pnpm changeset`          | Create new changeset             |
| `pnpm changeset:version`  | Consume changesets, bump version |
| `pnpm test`               | Run all tests                    |
| `pnpm build`              | Production build                 |
| `pnpm lint`               | Check linting                    |
| `pnpm audit --production` | Security audit                   |
