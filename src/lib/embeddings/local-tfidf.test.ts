import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLocalTfidfRanker, extractFeatures } from './local-tfidf.js';

describe('local TF-IDF ranker', () => {
  it('debería_extraer_unigramas_bigramas_y_hashes', () => {
    const features = extractFeatures('git commit message');
    assert.ok(features.has('w:git'));
    assert.ok(features.has('w:commit'));
    assert.ok(features.has('b:git_commit'));
    const hashKeys = [...features.keys()].filter((key) => key.startsWith('h:'));
    assert.ok(hashKeys.length > 0);
  });

  it('debería_preferir_documentos_semánticamente_cercanos', async () => {
    const ranker = createLocalTfidfRanker();
    const scores = await ranker.rank(
      'cron schedule autonomous headless cursor-agent tick without human',
      [
        'Cron tick collects git status and calls cursor-agent headless on a schedule for autonomous loops',
        'House git rules: Conventional Commits and tipo/descripcion branches with serial tests',
        'Favorite pizza toppings and afterparty snacks for the meetup dinner',
      ],
    );
    assert.equal(scores.length, 3);
    const cronScore = scores[0] ?? 0;
    const gitScore = scores[1] ?? 0;
    const pizzaScore = scores[2] ?? 0;
    assert.ok(
      cronScore > gitScore,
      `expected cron (${String(cronScore)}) > git (${String(gitScore)})`,
    );
    assert.ok(
      cronScore > pizzaScore,
      `expected cron (${String(cronScore)}) > pizza (${String(pizzaScore)})`,
    );
  });

  it('debería_devolver_lista_vacía_sin_documentos', async () => {
    const ranker = createLocalTfidfRanker();
    assert.deepEqual(await ranker.rank('anything', []), []);
  });
});
