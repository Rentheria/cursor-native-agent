import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cosineSimilarity,
  createCosineRankerFromEmbeddings,
  l2NormalizeInPlace,
} from './cosine.js';
import type { EmbeddingProvider } from './types.js';

describe('cosineSimilarity', () => {
  it('debería_devolver_1_para_vectores_idénticos', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  });

  it('debería_devolver_0_para_ortogonales_o_vacíos', () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.equal(cosineSimilarity([], []), 0);
    assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
  });
});

describe('l2NormalizeInPlace', () => {
  it('debería_normalizar_a_unidad', () => {
    const vector = [3, 4];
    l2NormalizeInPlace(vector);
    assert.ok(Math.abs((vector[0] ?? 0) - 0.6) < 1e-9);
    assert.ok(Math.abs((vector[1] ?? 0) - 0.8) < 1e-9);
  });
});

describe('createCosineRankerFromEmbeddings', () => {
  it('debería_ranquear_por_cosine_sobre_el_provider', async () => {
    const provider: EmbeddingProvider = {
      id: 'stub',
      async embed(texts) {
        return texts.map((text) => {
          if (text.includes('alpha')) return [1, 0];
          if (text.includes('beta')) return [0.9, 0.1];
          if (text.includes('gamma')) return [0, 1];
          return [0.5, 0.5];
        });
      },
    };
    const ranker = createCosineRankerFromEmbeddings(provider);
    const scores = await ranker.rank('alpha query', [
      'alpha doc',
      'gamma doc',
      'beta doc',
    ]);
    assert.equal(scores.length, 3);
    assert.ok((scores[0] ?? 0) > (scores[1] ?? 0));
    assert.ok((scores[2] ?? 0) > (scores[1] ?? 0));
  });
});
