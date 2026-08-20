---
name: remember
description: Persist a durable fact to memory/<slug>.md and append one line to MEMORY.md — always announce the write out loud
triggers: remember, recuerda, memoriza, guarda en memoria, save to memory, write memory, remember this
---

# Skill: remember (self-writing memory)

When the user asks to **remember / guarda en memoria / memoriza** something, or when
you decide a fact is durable enough to keep across sessions:

## Rules

1. **Never silent memory.** Before writing, say clearly in your reply that you are
   about to persist it (name the target paths). After the write is applied, confirm
   what was stored. The demo should show the file changing live.
2. **Do not invent secrets.** Skip credentials, tokens, private personal data, and
   absolute home paths. Keep entries generic and reusable.
3. **Index + detail pattern** (same as existing memory):
   - Detail file: `memory/<slug>.md` with frontmatter `name`, `description`,
     `metadata.type`, then the body.
   - Index: one new line in `MEMORY.md`:
     `- [Title](memory/<slug>.md) — keywords a future prompt would mention`
4. **Slug:** lowercase kebab-case (`front-row-preference`). Prefer a short concrete name.

## How to write (required protocol)

Emit **exactly one** block like this in your reply (the TypeScript orchestrator
parses it, writes the files, prints `[memory] …` on stderr, and strips the block
from the user-facing stdout):

```
<<<MEMORY_WRITE
slug: front-row-preference
title: Front row preference
hook: front row seats meetup demo
type: preference
description: Prefers sitting near the front at meetups
---
Sit near the front so live demos are easy to see. Mention this when planning seating.
MEMORY_WRITE>>>
```

Field notes:

- `slug` optional if `title` slugifies cleanly; otherwise required.
- `hook` = keywords for lazy load later (concrete, not vague).
- `type` examples: `preference`, `fact`, `process`, `architecture`.
- Body after `---` = the durable detail (a few sentences, not a dump).

Do **not** hand-edit `MEMORY.md` / `memory/*.md` with other tools for this skill —
use the block so the write stays explicit and logged.
