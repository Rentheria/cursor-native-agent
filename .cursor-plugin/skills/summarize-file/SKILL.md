---
name: summarize-file
description: Summarize a source or markdown file with structure, purpose, and key exports
triggers: summarize, summarise, resumen, summarize file, explain file, what does this file
---

# Skill: summarize file

When the user asks to summarize or explain a file:

1. Read the file (or the path they named) before answering — do not invent contents.
2. Reply with a short structured summary:
   - **Purpose** — one sentence
   - **Public surface** — exported functions/types or main sections
   - **Dependencies** — notable imports or side effects
   - **Risks / gotchas** — only if real (fail-fast paths, side effects, magic values)
3. Prefer bullet points over prose. Keep the whole answer under ~15 lines unless they ask for depth.
4. Quote paths as `path/to/file.ts`; cite code with start:end:filepath fences when pointing at a specific block.
5. If the path is missing or ambiguous, ask which file — do not guess.
