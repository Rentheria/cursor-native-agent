import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SemanticRanker } from '../lib/embeddings/types.js';
import type {
  MemoryDetailDocument,
  MemoryIndexEntry,
} from '../lib/types.js';
import {
  parseMemoryIndex,
  selectMemoryDetailsByKeywords,
  selectRelevantMemoryDetails,
} from './memory-loader.js';
import { selectSemanticMemoryDetails } from './semantic-memory.js';

function detail(
  name: string,
  description: string,
  body: string,
): MemoryDetailDocument {
  return {
    name,
    description,
    memoryType: 'note',
    body,
    filePath: `/tmp/memory/${name}.md`,
    relativeLink: `memory/${name}.md`,
  };
}

describe('parseMemoryIndex', () => {
  it('debería_parsear_lineas_del_índice', () => {
    const entries = parseMemoryIndex(`
# MEMORY
- [Agent architecture](memory/agent-architecture.md) — skills and lazy memory
- [House git rules](memory/house-git-rules.md) - branches tipo/descripcion
`);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.title, 'Agent architecture');
    assert.equal(entries[0]?.relativePath, 'memory/agent-architecture.md');
    assert.equal(entries[1]?.hook, 'branches tipo/descripcion');
  });
});

describe('selectRelevantMemoryDetails', () => {
  // Index/frontmatter hooks stay keyword-oriented; semantic signal lives in body
  // so paraphrases can recover entries the literal matcher misses.
  const catalog = [
    detail(
      'alpha-note',
      'orchestration patterns overview',
      'Autonomous cron schedule runs a headless cursor-agent tick without a human in the loop',
    ),
    detail(
      'beta-note',
      'commit trailer branches tipo/descripcion tests concurrency',
      'Co-authored-by Cursor and serial tests on shared hosts',
    ),
    detail(
      'gamma-note',
      'food preferences afterparty',
      'Favorite pizza toppings for the meetup dinner',
    ),
  ];
  const indexEntries: MemoryIndexEntry[] = [
    {
      title: 'Alpha note',
      relativePath: 'memory/alpha-note.md',
      hook: 'orchestration patterns overview',
      line: '- [Alpha note](memory/alpha-note.md) — orchestration patterns overview',
    },
    {
      title: 'Beta note',
      relativePath: 'memory/beta-note.md',
      hook: 'commit trailer branches tipo/descripcion',
      line: '- [Beta note](memory/beta-note.md) — commit trailer branches tipo/descripcion',
    },
    {
      title: 'Gamma note',
      relativePath: 'memory/gamma-note.md',
      hook: 'food dinner toppings',
      line: '- [Gamma note](memory/gamma-note.md) — food dinner toppings',
    },
  ];

  it('debería_cargar_por_keywords_literales', () => {
    const matched = selectMemoryDetailsByKeywords(
      'cuéntame de las branches tipo/descripcion',
      catalog,
      indexEntries,
    );
    assert.equal(matched.length, 1);
    assert.equal(matched[0]?.name, 'beta-note');
  });

  it('debería_recuperar_por_similitud_cuando_no_hay_keyword_match', async () => {
    const prompt =
      'cron schedule autonomous headless cursor-agent tick without human';
    const keywordMatched = selectMemoryDetailsByKeywords(
      prompt,
      catalog,
      indexEntries,
    );
    assert.equal(keywordMatched.length, 0);

    const selected = await selectRelevantMemoryDetails(
      prompt,
      catalog,
      indexEntries,
    );
    assert.ok(
      selected.some((entry) => entry.name === 'alpha-note'),
      `expected semantic hit for alpha-note, got: ${selected
        .map((entry) => entry.name)
        .join(', ')}`,
    );
    assert.ok(
      !selected.some((entry) => entry.name === 'gamma-note'),
      'gamma/pizza should not outrank cron content',
    );
  });

  it('debería_unir_keyword_y_semántica_sin_duplicar', async () => {
    const ranker: SemanticRanker = {
      id: 'stub',
      async rank(_query, documents) {
        return documents.map(() => 0.99);
      },
    };
    const keywordMatched = selectMemoryDetailsByKeywords(
      'tipo/descripcion branches',
      catalog,
      indexEntries,
    );
    assert.equal(keywordMatched[0]?.name, 'beta-note');

    const unmatched = catalog.filter((entry) => entry.name !== 'beta-note');
    const semantic = await selectSemanticMemoryDetails(
      'tipo/descripcion branches',
      unmatched,
      indexEntries,
      { ranker, threshold: 0.1, topK: 5 },
    );
    assert.ok(semantic.every((hit) => hit.detail.name !== 'beta-note'));
  });
});

