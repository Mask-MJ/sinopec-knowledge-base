---
name: git-workflow
description: Complete Git workflow with smart change classification, branch automation, PR generation, and release management. Use when committing code, creating PRs, managing branches, or when the user says "/git", "/pr", "/commit", or "/release".
triggers:
  - /git
  - /commit
  - /pr
  - /release
  - git workflow
  - branch naming
  - pull request
  - 提交
  - 推送
  - 合并
  - 发布
  - commit
  - push
role: specialist
scope: workflow
---

# Git Workflow

Smart Git workflow with automated change classification, branch creation, and PR generation.

## Hard Rules

> These rules are **non-negotiable** and apply to every workflow below.

1. **Mandatory Activation**: This skill MUST be loaded and followed for ANY git commit, push, PR, or release operation — regardless of whether the user explicitly uses a slash command. If the user says "提交", "commit", "push", or any equivalent, load `references/daily.md` and follow the full workflow.
2. **Language**: All commit messages MUST be in English.
3. **Commits**: Humans use `pnpm commit` (interactive git-cz). AI agents use `git commit -m` (commitlint validates both paths via Husky hook).
4. **Changesets**: Version-impacting changes require `pnpm changeset` before committing.
5. **Tags**: Tags are created on `main` only. Never tag `develop`.

## Decision Tree

```
What do you need?
│
├─ "I wrote code and need to commit"
│   └─► Load references/daily.md
│       (classify → branch or direct → commit → push)
│
├─ "I need to create a PR or merge"
│   └─► Load references/review.md
│       (gather context → generate description → create PR → merge)
│
├─ "I need to release a version"
│   └─► Load references/release.md
│       (checklist → changeset version → merge to main → tag)
│
└─ "I need to fix a mistake or do advanced ops"
    └─► Load references/advanced.md
        (rebase, cherry-pick, bisect, worktrees, recovery)
```

## Quick Commands

| Command    | Action                     | Loads        |
| :--------- | :------------------------- | :----------- |
| `/git`     | General help               | This file    |
| `/commit`  | Classify → Branch → Commit | `daily.md`   |
| `/pr`      | Generate PR description    | `review.md`  |
| `/release` | Version release workflow   | `release.md` |

## Reference Guide

| File                     | Scope                                            |
| :----------------------- | :----------------------------------------------- |
| `references/daily.md`    | Classify changes, branching, commit format, push |
| `references/review.md`   | PR creation, code review, merge strategies       |
| `references/release.md`  | SemVer, changelog, tagging, hotfix               |
| `references/advanced.md` | Rebase, cherry-pick, bisect, worktrees, recovery |
