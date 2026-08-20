---
name: delegate-worker
description: Dispatch a subtask to a second headless cursor-agent worker and wait for its result before reporting
triggers: pídele a otro agente, delega esto a
---

# Skill: delegate-worker

Delegation only fires on these **canonical phrases** (reliable for live demos):

1. `pídele a otro agente que <subtask>`
2. `delega esto a <target>: <subtask>`

When the user uses one of those phrases:

1. The TypeScript orchestrator already detects that intent and spawns a **second**
   `cursor-agent -p --force --trust` process (detached dispatch: log file + wait).
2. Do **not** pretend to spawn a worker yourself — rely on the orchestrator output.
3. After the worker finishes, summarize its exit code, log path, and useful output.
4. Engine is always `cursor-agent`. Never suggest other agent CLIs as the engine.
