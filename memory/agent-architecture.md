---
name: agent-architecture
description: Skills loader, MEMORY.md index plus lazy detail, semantic TF-IDF fallback, cron tick, multi-agent worker dispatch, cursor-agent engine
metadata:
  type: architecture
---

Pattern (design inspired by index+detail + loadable skills workspaces — not copied code):

1. **Skills** live in `skills/*.md` with YAML frontmatter (`name`, `description`, optional
   `triggers`) plus instruction body. The loader reads all skills at startup and selects
   by simple keyword/trigger match against the user prompt.
2. **Memory** uses `MEMORY.md` as the always-loaded index (one markdown link line per entry)
   and `memory/*.md` for detail with frontmatter (`name`, `description`, `metadata.type`).
   Detail files load when keywords from name/description/index hook match the prompt, or
   (fallback) when local semantic similarity (TF-IDF + hashed char n-grams) scores above
   threshold. Optional custom embedding module via env; unset/misconfigured → local.
3. **Self-writing memory** (`skills/remember.md`): when the user asks to remember something
   (or the model decides a fact is durable), the reply includes a `<<<MEMORY_WRITE…>>>`
   block. The orchestrator writes `memory/<slug>.md`, appends one `MEMORY.md` line, and
   prints `[memory] …` on stderr — never silent.
4. **Engine** is always `cursor-agent -p "<final prompt>"`. This TypeScript package only
   orchestrates context; it does not replace the model.
5. **Cron** (`npm run cron` / `scripts/cron-tick.sh`) collects a real git trigger and
   calls `cursor-agent` headless (`--force --trust --mode ask`). Each tick prepends a
   scannable `=== CRON FINDING … ===` block to `logs/cron.log` (branch, latest, tree,
   READY/DIRTY verdict, optional agent note) so a 30-second stage beat is just
   `tail -n 20 logs/cron.log`. On hosts that install Node via nvm, the wrapper must
   load nvm + the CLI bin dir — cron's PATH is minimal.
6. **Showcase skills** (`stage-pitch`, `code-spotlight`): short stage-ready formats
   for live demos — not infrastructure.
7. **Multi-agent** (`dispatchWorker`): intent only on two canonical phrases
   (`pídele a otro agente que…`, `delega esto a…`). Second `cursor-agent` process,
   log under `logs/workers/`, parent waits (Promise = notify) then runs another
   `cursor-agent` to report (sequential, not parallel; detached dispatch:
   log + wait + notify; single engine).

Out of scope for the Meetup demo: multi-channel, dashboard, remote-host polish.
Semantic memory (local embeddings) is implemented.
