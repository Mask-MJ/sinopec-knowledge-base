# PR & Code Review Workflow

From branch to merged code: gather context → generate description → create PR → merge.

## Step 1: Gather Context

### Determine Base Branch

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
  | sed 's@^refs/remotes/origin/@@' || echo "develop"
```

### Get Full Diff

```bash
# Diff from base branch
git diff develop...HEAD

# Diff statistics
git diff develop...HEAD --stat

# Changed files only
git diff develop...HEAD --name-only
```

### Get Commit History

```bash
# Full commit messages
git log develop..HEAD --format="%B---"

# One-line summary
git log develop..HEAD --oneline

# Check for issue references
git log develop..HEAD --oneline | grep -iE "(fix|close|resolve|ref)[s]?\s*#"
```

---

## Step 2: Analyze Changes

### Analysis Framework

| Aspect     | Questions to Answer              |
| :--------- | :------------------------------- |
| **What**   | What code/files changed?         |
| **Why**    | What problem does this solve?    |
| **How**    | What approach was taken?         |
| **Impact** | What systems/users are affected? |
| **Risk**   | What could go wrong?             |

### Clue Sources

- **Commit messages** — First lines reveal intent
- **Code comments** — TODOs, explanations
- **Test names** — Describe expected behavior
- **Deleted code** — What was wrong before?
- **Config changes** — New requirements

---

## Step 3: Generate Description

### Template

```markdown
## Summary

[1-2 sentences: Lead with WHY, then WHAT]

## Changes

[Group by component, not by file]

- **[Component]**: What changed and why
- **[Component]**: What changed and why

## Testing

[Be specific about verification]

- [ ] Unit tests pass
- [ ] Tested [specific flow]
- [ ] Verified [edge case]

## Reviewers

[Guide the review — optional]

- Focus on: [area needing attention]
- Question: [decisions you're unsure about]
```

### Quality Standards

**Summary:**

| ✅ Good                                           | ❌ Bad                     |
| :------------------------------------------------ | :------------------------- |
| Lead with WHY                                     | Lead with WHAT             |
| Specific: "Fix login timeout causing 5% failures" | Vague: "Fix login bug"     |
| One purpose per PR                                | Multiple unrelated changes |

**Changes section:**

| ✅ Good                    | ❌ Bad                |
| :------------------------- | :-------------------- |
| Group by component/feature | List by file          |
| Explain the WHY            | Just state the what   |
| Highlight breaking changes | Hide breaking changes |

```markdown
## ✅ Good

- **Rate Limiter**: Add Redis-backed middleware to prevent brute force
- **Auth Routes**: Apply 5 req/min limit to /login, /register
- **Config**: New RATE*LIMIT*\* env vars with sensible defaults

## ❌ Bad

- Changed auth.ts
- Updated config
- Added middleware
```

**Testing section:**

- Include manual testing steps
- Flag areas needing extra review
- Note what ISN'T tested

---

## Step 4: Create PR

### Gitea Web UI (Preferred)

1. Ensure branch is pushed: `git push origin feature/xxx`
2. Open Gitea repo → **Pull Requests** → **New Pull Request**
3. Select **Base**: `develop` | **Compare**: `feature/xxx`
4. Paste the generated PR description
5. Add Reviewer and Labels
6. **Checklist**: Confirm changeset is added (`pnpm changeset`)
7. Submit PR

### GitHub CLI (Reference only, for GitHub repos)

```bash
gh pr create \
  --title "type(scope): description" \
  --body "$(cat <<'EOF'
## Summary
...
EOF
)"

# Draft PR
gh pr create --draft --title "..." --body "..."
```

> ⚠️ Note: `mcp_gitkraken_pull_request_create` may return 404 on Gitea.
> In that case, use Gitea Web UI directly.

---

## Step 5: Merge Back

### Via Gitea (Preferred)

Approve and merge through the Gitea Web UI. Delete the branch after merge.

### Local Fallback (only when Gitea is unavailable)

```bash
git checkout develop
git pull origin develop
git merge --no-ff feature/user-profile  # Preserve merge commit
git push origin develop
git branch -d feature/user-profile      # Delete merged branch
```

---

## Edge Cases

### Large PRs (>500 lines)

Add overview section and suggest review order:

```markdown
## Overview

This PR implements [feature] through the following changes:

1. [High-level change 1]
2. [High-level change 2]
3. [High-level change 3]

Consider reviewing in this order: [file1] → [file2] → [file3]
```

**Better**: Split into smaller PRs.

### Refactoring PRs

Emphasize behavior unchanged:

```markdown
## Summary

Restructure auth module for better maintainability.
**No behavior changes** — all existing tests pass unchanged.

## Testing

- [x] All 47 existing auth tests pass
- [x] Manual login/logout flow verified
```

### Bug Fix PRs

Include full context:

```markdown
## Summary

Fix intermittent 500 errors on /api/users endpoint.

**Symptoms**: 5% of requests fail with "Connection refused"
**Root Cause**: Connection pool exhaustion under load
**Fix**: Implement connection recycling with 30s timeout

## Testing

- [x] Load test: 1000 req/s for 10 min — 0 failures
- [x] Verified connection count stays under 100
```

### Database Migrations

Include migration details and manual rollback SQL:

```markdown
## Summary

Add `lastLoginAt` field to User table.

## Migration

**Up**: `ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP`
**Down**: `ALTER TABLE users DROP COLUMN last_login_at`

## Rollback Steps

1. Execute reverse SQL: `npx prisma db execute --stdin <<< "ALTER TABLE users DROP COLUMN last_login_at"`
2. Mark migration as rolled back: `npx prisma migrate resolve --rolled-back <migration_name>`
3. Deploy previous version
```

> ⚠️ Prisma Migrate does not have a built-in `rollback` command. Execute reverse SQL manually.

### Dependency Updates

```markdown
## Summary

Upgrade Prisma from 6.x to 7.x for improved performance.

## Changes

- **package.json**: Bump prisma to 7.0.0
- **Schema**: No changes required
- **Migrations**: Compatible with existing migrations

## Breaking Changes

None — API is backward compatible.
```
