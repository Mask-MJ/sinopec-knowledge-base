# Advanced Git Operations

Power user techniques: history editing, cross-branch operations, parallel development, and recovery.

## Interactive Rebase

The Swiss Army knife of Git history editing.

### Operations

| Command  | Purpose                 |
| :------- | :---------------------- |
| `pick`   | Keep commit as-is       |
| `reword` | Change commit message   |
| `edit`   | Amend commit content    |
| `squash` | Combine with previous   |
| `fixup`  | Squash, discard message |
| `drop`   | Remove commit           |

### Usage

```bash
# Rebase last 5 commits
git rebase -i HEAD~5

# Rebase all commits on branch
git rebase -i $(git merge-base HEAD main)
```

### Clean Up Before PR

```bash
git checkout feature/user-auth
git rebase -i main

# In editor:
# - Squash "fix typo" commits
# - Reword for clarity
# - Reorder logically
# - Drop unnecessary commits

# Safe force push
git push --force-with-lease origin feature/user-auth
```

---

## Cherry-Picking

Apply specific commits from one branch without merging the entire branch.

```bash
# Single commit
git cherry-pick abc123

# Range of commits (exclusive start)
git cherry-pick abc123..def456

# Without committing (stage only)
git cherry-pick -n abc123

# Edit message
git cherry-pick -e abc123
```

### Apply Hotfix to Multiple Releases

```bash
git checkout main
git commit -m "fix: critical security patch"

git checkout release/2.0
git cherry-pick abc123

git checkout release/1.9
git cherry-pick abc123

# Handle conflicts
git cherry-pick --continue
# or: git cherry-pick --abort
```

### Partial Cherry-Pick

```bash
git show --name-only abc123
git checkout abc123 -- path/to/file1.py path/to/file2.py
git commit -m "cherry-pick: specific changes from abc123"
```

---

## Git Bisect

Binary search to find the commit that introduced a bug.

### Manual

```bash
git bisect start
git bisect bad HEAD
git bisect good v2.1.0

# Test, then mark
git bisect good  # or: git bisect bad

# Repeat until found
git bisect reset
```

### Automated

```bash
git bisect start HEAD v2.1.0
git bisect run npm test
```

---

## Autosquash Workflow

Automatically organize fixup commits.

```bash
# Initial commit
git commit -m "feat: add user auth"

# Later, fix something in that commit
git commit --fixup HEAD

# Rebase with autosquash
git rebase -i --autosquash main
```

---

## Split Commit

Split a single commit into multiple logical commits.

```bash
git rebase -i HEAD~3

# Mark commit with 'edit'
git reset HEAD^

# Commit in logical chunks
git add file1.py
git commit -m "feat: add validation"

git add file2.py
git commit -m "feat: add error handling"

git rebase --continue
```

---

## Rebase vs Merge

### When to Rebase

- Cleaning up local commits
- Keeping feature branch up-to-date
- Creating linear history

### When to Merge

- Integrating completed features
- Preserving collaboration history
- Public branches used by others

```bash
# Update with rebase (local branch)
git checkout feature/my-feature
git fetch origin
git rebase origin/develop

# Or merge (shared branch)
git merge origin/develop
```

---

## Worktrees

Create isolated workspaces to work on multiple branches simultaneously.

### Directory Selection Priority

1. Check for existing `.worktrees/` (preferred, hidden)
2. Check for existing `worktrees/`
3. Check CLAUDE.md for project preference
4. Ask user if no directory exists

| Location               | Path                                         | Notes                           |
| :--------------------- | :------------------------------------------- | :------------------------------ |
| Project-local (hidden) | `.worktrees/`                                | Preferred, must be gitignored   |
| Project-local          | `worktrees/`                                 | Alternative, must be gitignored |
| Global                 | `~/.config/superpowers/worktrees/<project>/` | No gitignore needed             |

### Safety Verification

For project-local directories, MUST verify the directory is gitignored:

```bash
git check-ignore -q .worktrees 2>/dev/null
```

If NOT ignored: add to `.gitignore`, commit, then proceed.

### Creation Workflow

```bash
# Detect project name
project=$(basename "$(git rev-parse --show-toplevel)")

# Create worktree
git worktree add .worktrees/auth -b feature/auth

# Setup project
cd .worktrees/auth
pnpm install
npx prisma generate  # If using Prisma

# Verify clean baseline
pnpm test
```

> ⚠️ **Node.js/pnpm notes**:
>
> - Each worktree requires an independent `pnpm install`
> - If using pnpm workspace hoisted mode, verify `.npmrc` consistency
> - Prisma users must re-run `npx prisma generate` in the worktree

### Common Commands

```bash
git worktree list                                    # List worktrees
git worktree add ../project-feature feature/branch   # Add for existing branch
git worktree add -b new-branch ../project-new main   # Add with new branch
git worktree remove ../project-feature               # Remove
git worktree prune                                   # Clean stale worktrees
```

---

## Recovery

Proven solutions for common Git mistakes.

### Wrong Branch Commit

```bash
COMMIT=$(git rev-parse HEAD)
git reset --hard HEAD~1
git checkout correct-branch
git cherry-pick $COMMIT
```

### Bad Push to Shared Branch

```bash
# Always revert on shared branches (main, develop)
git revert HEAD
git push origin branch-name
```

### Bad Push to Personal Branch

```bash
git reset --hard HEAD~1
git push --force-with-lease origin branch-name
```

> ⚠️ **Never** force push to `main` or `develop`. Always use `git revert`.

### Amended History Recovery

```bash
git reflog
git reset --soft HEAD@{1}    # Recover pre-amend state
# or:
git branch recovery HEAD@{1} # Save as new branch
```

### Merge Conflict Resolution

```bash
git status                       # See conflicting files
# Edit files to resolve conflicts
git add <resolved-files>
git rebase --continue            # or: git merge --continue

# Abort if needed
git rebase --abort
git merge --abort

# Accept all changes from one side
git checkout --ours path/to/file
git checkout --theirs path/to/file
```

### Changeset Correction

```bash
git reset --soft HEAD~1          # Reset version commit
# Fix changeset files in .changeset/
pnpm changeset:version           # Re-run
git diff && git add . && pnpm commit
```

### Tag Collision

```bash
git tag -d v1.7.0
git push origin --delete v1.7.0
git tag -a v1.7.0 -m "v1.7.0 - Description"
git push origin v1.7.0
```

### General Recovery Commands

```bash
# Abort in-progress operations
git rebase --abort
git merge --abort
git cherry-pick --abort
git bisect reset

# Restore file from commit
git restore --source=abc123 path/to/file

# Undo commit, keep changes
git reset --soft HEAD^

# Undo commit, discard changes
git reset --hard HEAD^

# Recover deleted branch
git reflog
git branch recovered-branch abc123
```

### Recovery Quick Reference

| Scenario             | First Action                  | Safe?      |
| :------------------- | :---------------------------- | :--------- |
| Wrong branch commit  | `git reset` + cherry-pick     | ✅ Local   |
| Bad push to shared   | `git revert HEAD`             | ✅ Always  |
| Bad push to personal | `git push --force-with-lease` | ⚠️ Careful |
| Lost commit          | `git reflog`                  | ✅ Always  |
| Merge conflict       | Edit + add + continue         | ✅ Always  |
| Wrong tag            | Delete + recreate             | ✅ Always  |

---

## Best Practices

### ✅ Do

- Use `--force-with-lease` instead of `--force`
- Rebase only local, unpushed commits
- Test before force push
- Create backup branch before risky ops: `git branch backup-$(date +%s)`
- Remember reflog retains 90 days of history

### ❌ Don't

- Rebase public/shared branches
- Force push without lease
- Proceed without resolving conflicts
- Leave orphaned worktrees
- Bisect on dirty working directory
