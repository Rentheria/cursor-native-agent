import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SEMANTIC_MEMORY_ENV,
  SEMANTIC_THRESHOLD_ENV,
  SEMANTIC_TOP_K_ENV,
} from '../lib/constants.js';
import type { SemanticRanker } from '../lib/embeddings/types.js';
import type {
  MemoryDetailDocument,
  MemoryIndexEntry,
} from '../lib/types.js';
import {
  buildMemorySearchText,
  isSemanticMemoryEnabled,
  readSemanticThreshold,
  readSemanticTopK,
  selectSemanticMemoryDetails,
} from './semantic-memory.js';

function detail(
  name: string,
  body: string,
  relativeLink = `memory/${name}.md`,
): MemoryDetailDocument {
  return {
    name,
    description: `${name} description`,
    memoryType: 'note',
    body,
    filePath: `/tmp/${relativeLink}`,
    relativeLink,
  };
}

describe('semantic memory helpers', () => {
  it('debería_estar_habilitada_por_defecto', () => {
    assert.equal(isSemanticMemoryEnabled({}), true);
    assert.equal(isSemanticMemoryEnabled({ [SEMANTIC_MEMORY_ENV]: '0' }), false);
    assert.equal(isSemanticMemoryEnabled({ [SEMANTIC_MEMORY_ENV]: 'off' }), false);
  });

  it('debería_leer_topK_y_threshold_desde_env', () => {
    assert.equal(readSemanticTopK({ [SEMANTIC_TOP_K_ENV]: '5' }), 5);
    assert.equal(readSemanticTopK({ [SEMANTIC_TOP_K_ENV]: 'nope' }), 3);
    assert.equal(
      readSemanticThreshold({ [SEMANTIC_THRESHOLD_ENV]: '0.25' }),
      0.25,
    );
  });

  it('debería_incluir_body_en_el_texto_de_búsqueda', () => {
    const doc = detail('cron', 'headless cursor-agent tick');
    const index: MemoryIndexEntry[] = [
      {
        title: 'Cron',
        relativePath: doc.relativeLink,
        hook: 'schedule autonomous loop',
        line: '- [Cron](memory/cron.md) — schedule autonomous loop',
      },
    ];
    const text = buildMemorySearchText(doc, index);
    assert.match(text, /headless cursor-agent tick/);
    assert.match(text, /schedule autonomous loop/);
  });

  it('debería_devolver_top_hits_sobre_el_umbral', async () => {
    const ranker: SemanticRanker = {
      id: 'stub',
      async rank(_query, documents) {
        return documents.map((_, index) => (index === 0 ? 0.9 : 0.05));
      },
    };
    const catalog = [
      detail('cron', 'autonomous scheduling'),
      detail('pizza', 'food prefs'),
    ];
    const hits = await selectSemanticMemoryDetails(
      'how does the agent wake up alone',
      catalog,
      [],
      { ranker, topK: 2, threshold: 0.1 },
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.detail.name, 'cron');
    assert.equal(hits[0]?.score, 0.9);
  });

  it('debería_respetar_disabled', async () => {
    const hits = await selectSemanticMemoryDetails(
      'anything',
      [detail('a', 'body')],
      [],
      { enabled: false },
    );
    assert.deepEqual(hits, []);
  });
});
