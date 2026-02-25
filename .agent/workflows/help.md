---
description: List all available slash commands, workflows, and skills
---

# Help — Available Commands

Print the table below to show the user all available commands.

## Workflows (slash commands with autocomplete)

| Command              | Description                                        |
| :------------------- | :------------------------------------------------- |
| `/help`              | Show this help menu                                |
| `/worktree-parallel` | Create isolated worktrees for multi-agent parallel |

## Skills (AI auto-matches, or use trigger keywords)

| Trigger                    | Skill                      | Description                                      |
| :------------------------- | :------------------------- | :----------------------------------------------- |
| `/git`                     | git-workflow               | General Git help                                 |
| `/commit`                  | git-workflow               | Classify changes → create branch → commit → push |
| `/pr`                      | git-workflow               | Generate PR description and create PR            |
| `/release`                 | git-workflow               | Version release workflow (changeset → tag)       |
| "code review"              | code-review-expert         | Expert code review of current git changes        |
| (auto when writing NestJS) | nestjs-best-practices      | NestJS architecture patterns and best practices  |
| (auto)                     | claude-code-best-practices | Claude Code usage tips from Anthropic            |

## Notes

- **Workflows** appear in IDE autocomplete when you type `/`.
- **Skills** are loaded automatically by AI based on context, but you can also type the trigger keywords explicitly.
- To add a new workflow: create a `.md` file in `.agent/workflows/`.
- To add a new skill: create a folder with `SKILL.md` in `.agent/skills/`.
