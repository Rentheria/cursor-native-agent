# cursor-native-agent

[Español](./README.md) | **English**

[![CI](https://github.com/Rentheria/cursor-native-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Rentheria/cursor-native-agent/actions/workflows/ci.yml)

---

> **Note:** This English README provides installation and architecture overview. For complete usage documentation (one-shot mode, REPL, cron setup, Telegram bot, dashboard, watch mode, multi-agent orchestration), see the [Spanish README](./README.md).

---

> **TL;DR:** `npm run setup` → `npm run agent -- "your prompt"`. TypeScript wrapper that orchestrates markdown skills + lazy memory over cursor-agent (native Cursor CLI). Public repository; package marked `private: true` in package.json (not published to npm).

---

Personal agent built **100% on top of `cursor-agent`** (Cursor CLI) — markdown skills + lazy-loaded index+detail memory + autonomous cron loop + multi-agent orchestration.

**What is it?** An agent that runs on YOUR Cursor account (your subscription, your billing). The brain is `cursor-agent` (Cursor CLI); this TypeScript package only assembles context (skills + memory) and delegates all reasoning.

**Default model:** **Composer 2.5 Fast** — pinned in `.env.example` via `CURSOR_AGENT_MODEL=composer-2.5-fast` for consistent tone. Remove that line, set it to `auto`, or export your own model with `CURSOR_AGENT_MODEL=<id>` (run `cursor-agent models` to see available IDs) — if empty or missing, cursor-agent uses Auto.

**Quick start in 3 steps:**

```bash
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent
npm run setup
```

Requirements: Node ≥ 20 and `cursor-agent` installed ([see below](#quick-installation)).

For the complete walkthrough: [TUTORIAL.md](./TUTORIAL.md) (Spanish).

**For personal use (download-and-run):** Everyone runs it on their own machine. Dashboard only on `127.0.0.1`; token in `.env`; confirm before writes. Never commit `.env`. See "Personal use / security" section below.

**Cursor does not distribute this product.** It's an example wrapper around the CLI that lives outside the IDE. In the IDE you work on a repo; this is the agent as its own thing, authenticated as you, with markdown skills + lazy memory + optional Telegram/cron/dashboard.

## Personal use / security

This is a **personal download-and-run agent**: each person runs it on their own machine (your Cursor account, your billing). It's not multi-tenant SaaS.

**Security model:**

- **Dashboard** only listens on `127.0.0.1` (localhost). Chat requires `DASHBOARD_TOKEN` from `.env` (generated automatically in `npm run setup`). Uses header `X-Dashboard-Token` or `Authorization: Bearer`.
- **Agent** runs with `--trust` on the workspace. Dashboard and Telegram ask to **Confirm** before writing files (`--force` under workspace/).
- **Never commit `.env`** (contains token, Telegram secrets). `threads/` and `workspace/` are already in `.gitignore`.
- **Telegram** optional; fails closed without `TELEGRAM_ALLOWED_CHAT_IDS` (mandatory allowlist).

Don't expose the dashboard port to the internet without additional authentication. Security bar: safe enough for folks to leave dashboard/Telegram/cron running daily.

## Cursor Plugin (local)

This repo can also be loaded as a [Cursor Plugin](https://cursor.com/docs/plugins) from `~/.cursor/plugins/local/`. Manifest, skills layout, and installation instructions:

see [`.cursor-plugin/README.md`](./.cursor-plugin/README.md).

The wrapper skills remain in `skills/*.md` (source of truth); the nested layout for Cursor is regenerated with `./scripts/sync-plugin-skills.sh`.

## How to adapt it to your repo

The agent reads everything from the repo root, so adapting it is editing markdown:

1. Write your own skills in `skills/*.md` (frontmatter `name` + `description`/`triggers`, and the body is the instructions).
2. Replace the entries in `MEMORY.md` with yours and put the detail in `memory/*.md`. The conventions there are examples from this repo, not requirements: delete or change them.
3. Adjust the cron prompt in `src/orchestration/cron-tick.ts` if you want a different trigger than git status.

**Workspace path:** By default, the agent builds projects in `<repo>/workspace/`. If you want to use another path (e.g. `~/Documents/AGE`), set `WORKSPACE_PATH` in `.env` (during `npm run setup` you're asked Auto or Custom). If empty or missing, uses `<repo>/workspace`. The agent sees the resolved path in its prompt context.

No need to touch TypeScript to change agent behavior.

## Quick installation

### Prerequisites

1. **Node.js ≥ 20** (tested with Node 22+)
2. **Cursor CLI:**
   - macOS / Linux / WSL: `curl https://cursor.com/install -fsS | bash`
   - Windows PowerShell: `irm 'https://cursor.com/install?win32=true' | iex`
   - Docs: [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation)
3. **Login:** `cursor-agent login` (opens browser)
4. **(Optional) MarkItDown for PDFs:** To attach PDF files, install:
   ```bash
   pip install markitdown[pdf]
   ```
   MarkItDown converts PDFs to markdown, saving tokens vs plain text or OCR images.

### Setup in one command

```bash
# 1. Clone the repo
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent

# 2. Install and configure (checks deps + cursor-agent + creates .env and workspace/)
#    Asks you where you want the workspace (Auto = <repo>/workspace, Custom = absolute path)
npm run setup

# 3. First prompt
npm run agent -- "summarize file MEMORY.md"

# 4. (Optional) Set up autonomous health tick
npm run cron:install
```

`npm run setup` creates `.env` with safe defaults (Composer 2.5 Fast model, Telegram omitted). If you run with TTY, it asks about workspace path (Auto = `<repo>/workspace`, Custom = absolute or relative path); no-TTY uses Auto silently.

**Optional step:** after `npm run setup`, running `npm run cron:install` sets up a cron job that checks repo health every weekday (9:00 AM local time, check-only without spending model). If you configured Telegram, you get a notification when there are errors/warnings; READY ticks stay silent in `logs/cron.log`.

If `cursor-agent` is not in `PATH`, export `CURSOR_AGENT_BIN_PATH` or install it according to the instructions `npm run setup` prints.

**Environment variables:** `npm run setup` creates `.env` automatically with safe defaults (Composer 2.5 Fast, port 3847, chat enabled, workspace in `<repo>/workspace`, Telegram omitted). Shell exports win over the file. To customize, edit `.env` directly or run `npm run onboard` for the interactive flow.

**Change model:** the default is Composer 2.5 Fast (`CURSOR_AGENT_MODEL=composer-2.5-fast` in `.env.example`). To use another model, export `CURSOR_AGENT_MODEL=<id>` in the shell or edit it in `.env`. Set it to `auto` or leave it empty for cursor-agent to use Auto (its default without `--model`). List of IDs: `cursor-agent models`.

Telegram requires mandatory config (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`) — the bot fails closed without those vars. Configure it with `npm run onboard` or by exporting the vars directly.

Optional global installation (command `cursor-native-agent` available in any directory):

```bash
npm run build        # compiles TypeScript to dist/
npm install -g .
cursor-native-agent --interactive
```

## Usage

See the [Spanish README](./README.md) for complete usage documentation covering:

- **One-shot mode** (`npm run agent`) with file attachments and @ mentions
- **Interactive REPL** (`npm run chat`) with persistent sessions
- **Autonomous cron** (`npm run cron`) with health checks
- **Telegram bot** (`npm run telegram`) with long polling
- **Web dashboard** (`npm run dashboard`) with interactive chat
- **Watch mode** (`npm run watch`) for hot-reload development
- **Multi-agent orchestration** with worker delegation

All channels (Terminal, Dashboard, Telegram) share the same skills + memory pipeline and use `cursor-agent` as the reasoning engine.

## Architecture

High-level flow:

```
user prompt
        │
        ├─► skills-loader   — reads skills/*.md, matches by triggers/keywords
        ├─► memory-loader   — MEMORY.md + detail (keywords or local semantic)
        ├─► delegation?     — if there's intent → worker (sequential)
        └─► prompt-builder  — concatenates index + details + skills + prompt
                    │
                    ▼
            cursor-agent -p "<final prompt>"
                    │
                    ▼
               response in stdout
```

Code layout:

```
src/core/           CLI entrypoint, REPL, agent-turn, prompt assembly, cursor-agent invocation
src/channels/       channel adapters (Telegram long poll)
src/loaders/        skills and memory reading (keywords + semantic)
src/orchestration/  cron tick and worker dispatch
src/dashboard/      HTTP server (HTML + log parsers + chat API)
src/lib/            types, constants, local embeddings (TF-IDF)
skills/*.md         example skills (git-commit, explain-error, remember, etc.)
MEMORY.md           always loaded index
memory/*.md         lazy detail by keyword/semantic
```

For complete architecture details, scope design, and week-by-week plan: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Semantic memory and skills

By default the loader uses a **local** backend (TF-IDF on unigrams/bigrams + hashed character n-grams) in `src/lib/embeddings/`. No API key or configuration required. Both memory and skills share the same local ranker.

| Variable | Default | Effect |
| --- | --- | --- |
| `CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY` | on | `0` / `false` / `off` disables semantic fallback for memory |
| `CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS` | on | `0` / `false` / `off` disables semantic fallback for skills |
| `CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K` | `3` | Maximum semantic hits (shared: memory + skills) |
| `CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD` | `0.12` | Minimum similarity score (cosine / TF-IDF; shared) |
| `CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER` | `local` | `local` / `tfidf`, or `custom` |
| `CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE` | (empty) | Path to an ESM module if `PROVIDER=custom` |
| `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT` | on | `0` / `false` / `off` disables chat (dashboard read-only) |

Extension (optional, doesn't break if missing):

```bash
# Module that exports createEmbeddingProvider(): { id, embed(texts) }
export CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER=custom
export CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE=./path/to/my-provider.mjs
npm run agent -- "question that doesn't use index keywords"
```

## Roadmap

Open ideas — no dates or commitments:

- **More channels** — WhatsApp (Meta Business + webhook) or other transports
- **Remote embedding provider** — OpenAI, etc. against the extension point
- **Richer dashboard** — active workers, complete transcripts, auto-refresh
- **Automatic backups** — snapshot of MEMORY.md + memory/ + logs
- **More example skills** — PR review, changelog, failed CI diagnosis
- **More tests** — loader edge-cases, REPL, cursor-agent error paths
- **Other cron triggers** — last commit age, logs/ size, HTTP healthcheck
- **Loader improvements** — compound triggers, skill priorities, exclusions

See also "Out of scope" in `ARCHITECTURE.md` and [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

This project is licensed under the [MIT License](./LICENSE). Copyright (c) 2026 Alejandro Rentheria.

## Reference commands

```bash
npm run setup                 # initial setup (deps + .env + workspace/ + check cursor-agent)
npm run agent -- "<prompt>"   # orchestrates skills/memory → cursor-agent -p
npm run chat                  # continuous REPL
npm run cron                  # autonomous tick (git trigger + cursor-agent)
npm run cron:install          # installs cron job for unattended ticks (weekdays 9:00 AM)
npm run cron:uninstall        # uninstalls cron job
npm run telegram              # Telegram bot (requires TELEGRAM_BOT_TOKEN)
npm run dashboard             # HTTP observatory + chat (PORT, default 3847)
npm run watch                 # local change monitoring (no active processes)
npm run watch:dashboard       # monitoring + dashboard server with hot-reload
npm run onboard               # interactive configuration (model, workspace, Telegram)
npm run typecheck             # tsc --noEmit
npm run build                 # tsc (compiles to dist/)
npm test                      # node:test in series (--test-concurrency=1)
```

---

**Origin note:** This project was created for the Cursor Meetup GDL (August 2026) and now works as a personal agent for daily use. Clone it, customize skills/memory, and run your agent on your Cursor account. Licensed under MIT — see [LICENSE](./LICENSE).
