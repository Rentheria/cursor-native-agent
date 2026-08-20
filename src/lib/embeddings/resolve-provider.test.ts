import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  EMBEDDINGS_MODULE_ENV,
  EMBEDDINGS_PROVIDER_ENV,
  resolveSemanticRanker,
} from './resolve-provider.js';

describe('resolveSemanticRanker', () => {
  it('debería_usar_local_tfidf_por_defecto', async () => {
    const ranker = await resolveSemanticRanker({}, () => undefined);
    assert.equal(ranker.id, 'local-tfidf');
  });

  it('debería_hacer_fallback_a_local_si_custom_no_tiene_módulo', async () => {
    const warnings: string[] = [];
    const ranker = await resolveSemanticRanker(
      { [EMBEDDINGS_PROVIDER_ENV]: 'custom' },
      (message) => {
        warnings.push(message);
      },
    );
    assert.equal(ranker.id, 'local-tfidf');
    assert.ok(warnings.some((line) => line.includes(EMBEDDINGS_MODULE_ENV)));
  });

  it('debería_cargar_un_módulo_custom_válido', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cna-embed-'));
    const modulePath = path.join(dir, 'provider.mjs');
    try {
      await writeFile(
        modulePath,
        `
export function createEmbeddingProvider() {
  return {
    id: 'test-custom',
    async embed(texts) {
      return texts.map((text) => [text.length, 1]);
    },
  };
}
`,
        'utf8',
      );
      const ranker = await resolveSemanticRanker(
        {
          [EMBEDDINGS_PROVIDER_ENV]: 'custom',
          [EMBEDDINGS_MODULE_ENV]: modulePath,
        },
        () => undefined,
      );
      assert.equal(ranker.id, 'cosine:test-custom');
      const scores = await ranker.rank('ab', ['abcd', 'a']);
      assert.equal(scores.length, 2);
      assert.ok((scores[0] ?? 0) >= (scores[1] ?? 0));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('debería_hacer_fallback_si_el_provider_es_desconocido', async () => {
    const warnings: string[] = [];
    const ranker = await resolveSemanticRanker(
      { [EMBEDDINGS_PROVIDER_ENV]: 'openai-paid' },
      (message) => {
        warnings.push(message);
      },
    );
    assert.equal(ranker.id, 'local-tfidf');
    assert.ok(warnings.some((line) => line.includes('Unknown')));
  });
});
