# MEMORY — Long-term index for cursor-native-agent

This index is always loaded into the prompt. Each detail file under `memory/` is
loaded only when the user's prompt matches the entry's keywords, so the index
stays cheap no matter how much memory accumulates behind it.

Format: one line per memory, `- [Title](memory/file.md) — keywords a prompt would
mention`. Keep the hook concrete; it is what the matcher searches.

- [Agent architecture](memory/agent-architecture.md) — skills + MEMORY.md lazy-load + semantic TF-IDF embeddings fallback + self-writing remember skill + cron + worker dispatch + cursor-agent as brain
- [House git rules](memory/house-git-rules.md) — example convention set: commit trailer, branches tipo/descripcion, tests --test-concurrency=1
