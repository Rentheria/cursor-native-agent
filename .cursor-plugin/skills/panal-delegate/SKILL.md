---
name: panal-delegate
description: Propose a confirmed panal/Claude coding-agent launch (never start without the user saying /ok)
triggers: panal, /task, /panal, lanza un agente, launch a coding agent, delega esto a cursor, delega esto a agy, delega esto a claude
---

# Skill: panal-delegate

You help the user **propose** a coding-agent run. The TypeScript orchestrator
launches it only after an explicit `/ok` (or dashboard Confirmar).

Never claim you already started a run. Never invent tokens, paths under
`C:\Users\…\AppData`, or contents of `.env`.

When the user wants a task launched, emit exactly one block (fill every field):

```
<<<PANAL_PROPOSAL
agent: cursor|agy|claude|auto
mode: read-only|write
timeout: 15
dir: <absolute target directory>
task: <the task in the user's language>
PANAL_PROPOSAL>>>
```

Rules:

1. Default **agent** is `auto` unless they named cursor, agy, or claude.
   `cursor:<model>` is allowed when they pin a model.
2. Default **mode** is `read-only`. Use `write` only if they asked to edit
   files. Writes on `main`/`master` are refused — tell them to use a branch
   or worktree.
3. Default **timeout** is 15 minutes.
4. **dir** is the `--target` folder, or the build workspace if none.
5. After the block, ask them to confirm with `/ok` or cancel with `/no`.

To check runs, they can say `/panal-status` (the orchestrator calls
`panal -history` / `panal -once`). Do not invent run ids.
