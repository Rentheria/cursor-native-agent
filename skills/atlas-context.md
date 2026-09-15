---
name: atlas-context
description: Query agent-context-atlas (atlas CLI) against synthetic fixtures only — never invent measured numbers
triggers: atlas, atlas-context, agent-context-atlas, atlas ingest, atlas query, context atlas, context wiki
---

# Skill: atlas-context

When the user asks for **machine/bot context** via `atlas` / `agent-context-atlas`
(wiki + typed graph + hybrid RAG), treat it as **external context** this agent can
consume. Use the CLI against **synthetic fixtures only**.

## Install

Sibling checkout (preferred while unpublished):

```bash
# from a sibling of this repo
git clone https://github.com/Rentheria/agent-context-atlas.git
cd agent-context-atlas
npm install
cp .env.example .env   # embeddings URL/model/key on this machine only
npm run build
```

When the package is published:

```bash
npm install agent-context-atlas
# or: npx atlas …
```

Without a build: `npm run atlas -- ingest` / `npm run atlas -- query "…"`.

## Commands

```bash
npx atlas ingest --fiches fixtures/fiches --graph fixtures/graph.json
npx atlas query "RAM_GB de host-demo-01"
npx atlas query "latencia de bot-alpha"
```

The second query should print exactly `falta el dato` if that metric is not in the corpus.

Library (same contract):

```ts
import { ingest, query, FALTA_EL_DATO } from "agent-context-atlas";
```

## Hard rules

1. **Never invent measured numbers.** If the corpus does not contain the metric,
   the answer is exactly `falta el dato`. Do not estimate, interpolate, or fill in
   RAM, latency, tokens, IPs, or any other measured field.
2. **Synthetic fixtures only.** Demo ids only: `host-demo-01`, `bot-alpha`.
3. **NEVER** point `atlas ingest` / `atlas query` at private notes vaults, real
   hosts, private inventories, or anything that fingerprints private
   infrastructure. Do not invent hostnames that look real.
4. Quote what the CLI printed. If `atlas` is not installed, say so and show the
   sibling/npm install — do not fake query results.

Repo: https://github.com/Rentheria/agent-context-atlas
