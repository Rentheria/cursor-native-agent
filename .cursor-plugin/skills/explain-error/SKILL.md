---
name: explain-error
description: Diagnose terminal errors and TypeScript/Node failures with a concrete next step
triggers: error, stack trace, typescript error, failed, exception, crash, typecheck
---

# Skill: explain-error

When the user pastes an error, stack trace, or failing command output:

1. Identify **what failed** (command, compiler, runtime) and **where** (file:line if present).
2. State the likely root cause in one sentence — no speculative laundry lists.
3. Give **one** concrete next action (command to run or change to make).
4. If the error is from `tsc`, focus on the first error; later errors are often cascading.
5. Never invent APIs or config flags. If unsure, say what to inspect next.
