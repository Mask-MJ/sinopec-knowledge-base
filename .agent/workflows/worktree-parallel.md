---
description: Create isolated worktrees for multi-agent parallel development tasks
---

# Worktree Parallel Workflow

Use this workflow to spin up isolated worktrees for parallel agent tasks. Each agent works in its own directory on its own branch, with zero interference.

## Prerequisites

// turbo

1. Verify `.worktrees/` is gitignored:

```bash
git check-ignore -q .worktrees || (echo ".worktrees/" >> .gitignore && git add .gitignore && git commit -m "chore: gitignore worktrees directory")
```

## Create Worktree

2. Create a worktree for the task (replace `<branch>` with the feature/fix branch name, e.g. `feat/order-sync`):

```bash
git worktree add .worktrees/<branch> -b <branch> develop
```

3. Initialize the worktree environment:

```bash
cd .worktrees/<branch> && pnpm install
```

// turbo 4. Verify baseline passes before starting work:

```bash
cd .worktrees/<branch> && pnpm test
```

## Development

5. Do all coding work inside `.worktrees/<branch>/`. Commit and push normally:

```bash
cd .worktrees/<branch>
git add .
git commit -m "<type>(<scope>): <description>"
git push -u origin <branch>
```

## Cleanup (after branch is merged)

6. Remove the worktree:

```bash
git worktree remove .worktrees/<branch>
```

// turbo 7. Prune stale worktree metadata:

```bash
git worktree prune
```

## Quick Reference

| Command                                      | Purpose                   |
| :------------------------------------------- | :------------------------ |
| `git worktree list`                          | List all active worktrees |
| `git worktree add <path> -b <branch> <base>` | Create new worktree       |
| `git worktree remove <path>`                 | Remove a worktree         |
| `git worktree prune`                         | Clean stale metadata      |

## Red Flags

- ❌ Creating project-local worktree without gitignore check
- ❌ Starting development when baseline tests fail
- ❌ Forgetting to remove worktrees after merge (disk bloat)
- ❌ Trying to checkout the same branch in two worktrees (Git forbids this)
