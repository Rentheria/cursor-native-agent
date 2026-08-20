# Contributing to cursor-native-agent

Thanks for taking an interest. This repo is a **reference pattern** (skills +
markdown memory + cron + worker dispatch around `cursor-agent`), not a general
agent framework. Keep contributions small and aligned with that shape.

## Setup

El repositorio es público. Podés clonarlo directamente:

```bash
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent
npm install

# Actualizar en sesiones futuras
git pull
npm install
```

También podés usar el `gh` CLI si lo preferís:

```bash
gh repo clone Rentheria/cursor-native-agent
cd cursor-native-agent
npm install
```

Confirm the engine is available before running prompts:

| Sistema | Comando |
|---|---|
| **macOS / Linux / WSL** | `which cursor-agent` |
| **Windows PowerShell** | `Get-Command cursor-agent` o `where cursor-agent` |

Luego verifica versión y typecheck:

```bash
cursor-agent --version
npm run typecheck
npm test
```

Optional smoke test:

```bash
npm run agent -- "en una frase: qué hace este repo"
```

## Branch and commit conventions

- **Base branch:** always branch from up-to-date `main`. Pull requests should
  target `main`.
- **Branch names:** `tipo/descripcion` only — e.g. `feat/skills-loader`,
  `docs/readme-arquitectura-contributing`. Never `TICKET-123-…`.
- **Commits:** Conventional Commits in English, imperative mood, one topic per
  commit.
- **Co-author trailer (required in this repo):** every commit must include:

  ```
  Co-authored-by: Cursor <cursoragent@cursor.com>
  ```

  This project is a demo of building with Cursor CLI; the trailer keeps that
  history verifiable. Most other repos do not need this — here it is expected.

Example:

```bash
git commit -m "$(cat <<'EOF'
feat(skills): add example skill for PR review drafts

Co-authored-by: Cursor <cursoragent@cursor.com>
EOF
)"
```

Never force-push to `main`.

## Checks before a PR

Always run both and keep them green:

```bash
npm run typecheck
npm test
```

Tests use Node’s built-in runner in series (`--test-concurrency=1`). Do not
switch to parallel runners without a strong reason.

## What makes sense to contribute

Good fits:

- New **example skills** under `skills/*.md` (frontmatter `name` +
  `description`/`triggers` + clear body instructions).
- Improvements to the **loaders** (frontmatter parsing, keyword match, lazy
  memory selection) without changing the “brain = cursor-agent” contract.
- Extra **cron triggers** or safer wrappers (still grounded in real machine
  state, still `--mode ask` unless the design explicitly changes).
- **Docs** (README, CONTRIBUTING, ARCHITECTURE clarifications).
- Focused **tests** for existing behavior.

Out of scope / please don’t:

- Turning this into a generic multi-engine framework or adding fallback CLIs
  besides `cursor-agent`.
- Embeddings / vector memory, multi-channel transports, or a web dashboard as
  a surprise PR — those are open ideas (see README roadmap) but they change
  the demo’s scope; discuss first.
- Large refactors that bury the pattern under abstraction layers.
- Copying private workspace code from elsewhere; replicate the *pattern*, not
  proprietary sources.

## Pull request process

1. Create a descriptive branch from `main`: `tipo/descripcion`.
2. Implement in small, atomic commits (with the Co-authored-by trailer).
3. Run `npm run typecheck` and `npm test`.
4. Open a PR **against `main`**.
5. Wait for review; do not merge your own PR unless a maintainer asks you to.

A useful PR description: what changed, why, and how you verified it (commands
+ expected result).

## Questions about scope

If something sits on the README roadmap or in `ARCHITECTURE.md` “out of
scope”, open an issue or draft PR with a short design note before a large
implementation. The bar is: still readable in one sitting, still 100%
`cursor-agent` as the reasoning engine.
