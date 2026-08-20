---
name: house-git-rules
description: Example memory entry — the git conventions this project chose for itself
metadata:
  type: process
---

This file is an **example** of the "conventions memory" pattern: a short, stable
set of rules the agent should recall whenever it touches git. The rules below are
the ones *this* project picked while it was being built. They are not a
recommendation — adapt or delete this entry for your own repo.

Conventions used in this repo:

- Commits carry `Co-authored-by: Cursor <cursoragent@cursor.com>`. This project
  is a demo of building with Cursor CLI, so the co-author trailer is how its
  history stays verifiable as Cursor-built. Most repos have no reason to do this.
- Branches and commit scopes use `tipo/descripcion` (example: `feat/skills-loader`),
  never `TICKET-123-descripcion`.
- Tests run serially (`--test-concurrency=1` / `--runInBand`), because this repo is
  developed on a host shared with other agents and parallel runners have knocked
  services over.
- Conventional Commits in English. Push only when the task or user asks.
- `main` is the primary branch; all work lands there directly via pull requests.

What is worth copying is the shape, not the content: one file, a handful of rules
the agent can apply without asking, indexed from `MEMORY.md` so it only loads when
a prompt is actually about git.
