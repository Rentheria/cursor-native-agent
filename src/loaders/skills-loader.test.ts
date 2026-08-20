import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectRelevantSkills, type SemanticSkillOptions } from './skills-loader.js';
import type { SkillDocument } from '../lib/types.js';
import { createLocalTfidfRanker } from '../lib/embeddings/local-tfidf.js';

const mockSkills: readonly SkillDocument[] = [
  {
    name: 'git-commit',
    description: 'Draft Conventional Commit messages',
    triggers: ['commit', 'git commit', 'conventional commit'],
    body: 'Help write commit messages following Conventional Commits format…',
    filePath: '/mock/git-commit.md',
  },
  {
    name: 'stage-pitch',
    description: 'Deliver a 30-second stage pitch of this repo for live Meetup demos',
    triggers: ['pitch', 'elevator pitch', 'stage pitch', 'present this', 'pitch the repo'],
    body: 'Deliver a concise stage pitch for Meetup demos explaining what this repo does and how it helps developers…',
    filePath: '/mock/stage-pitch.md',
  },
  {
    name: 'code-spotlight',
    description: 'Spotlight one file or function for a live audience',
    triggers: ['spotlight', 'code spotlight', 'highlight this', 'show on stage'],
    body: 'Highlight code for live demo and explain the implementation…',
    filePath: '/mock/code-spotlight.md',
  },
  {
    name: 'clarify-build',
    description: 'Ask clarifying questions before building underspecified apps or projects',
    triggers: ['build', 'create', 'develop', 'calculator', 'aplicación', 'programa', 'construye', 'crea'],
    body: 'When the user asks to build, create, or develop an app/project/program but the request is underspecified…',
    filePath: '/mock/clarify-build.md',
  },
];

describe('skills-loader', () => {
  it('debería_matchear_por_trigger_exacto', async () => {
    const matched = await selectRelevantSkills('please draft a git commit', mockSkills);
    assert.equal(matched.length, 1);
    assert.equal(matched[0]?.name, 'git-commit');
  });

  it('debería_respetar_palabras_completas_en_triggers', async () => {
    const matched = await selectRelevantSkills('fix my commitment issues', mockSkills);
    assert.equal(matched.length, 0);
  });

  it('debería_matchear_frases_multi_palabra', async () => {
    const matched = await selectRelevantSkills('give me an elevator pitch', mockSkills);
    assert.equal(matched.length, 1);
    assert.equal(matched[0]?.name, 'stage-pitch');
  });

  it('debería_caer_a_semántico_cuando_no_hay_trigger_exacto', async () => {
    const ranker = createLocalTfidfRanker();
    const options: SemanticSkillOptions = {
      ranker,
      enabled: true,
      topK: 2,
      threshold: 0.03,
    };
    const matched = await selectRelevantSkills('what does this repo do', mockSkills, options);
    assert.ok(matched.length > 0, 'debería encontrar al menos un skill por semántica');
    const names = matched.map((s) => s.name);
    assert.ok(
      names.includes('stage-pitch'),
      'stage-pitch debería ser relevante para "what does this repo do"',
    );
  });

  it('debería_devolver_nada_cuando_semantic_está_deshabilitado_y_no_hay_trigger', async () => {
    const options: SemanticSkillOptions = { enabled: false };
    const matched = await selectRelevantSkills('qué hace este repo', mockSkills, options);
    assert.equal(matched.length, 0);
  });

  it('debería_preferir_match_exacto_sobre_semántico', async () => {
    const ranker = createLocalTfidfRanker();
    const options: SemanticSkillOptions = {
      ranker,
      enabled: true,
      topK: 3,
      threshold: 0.05,
    };
    const matched = await selectRelevantSkills('please spotlight this code', mockSkills, options);
    assert.equal(matched.length, 1, 'debería devolver solo el match exacto');
    assert.equal(matched[0]?.name, 'code-spotlight');
  });

  it('debería_respetar_el_umbral_threshold', async () => {
    const ranker = createLocalTfidfRanker();
    const options: SemanticSkillOptions = {
      ranker,
      enabled: true,
      topK: 3,
      threshold: 0.99,
    };
    const matched = await selectRelevantSkills('qué hace este repo', mockSkills, options);
    assert.equal(matched.length, 0, 'umbral alto debería rechazar todos los resultados');
  });

  it('debería_respetar_topK', async () => {
    const ranker = createLocalTfidfRanker();
    const options: SemanticSkillOptions = {
      ranker,
      enabled: true,
      topK: 1,
      threshold: 0.05,
    };
    const matched = await selectRelevantSkills('help me with code', mockSkills, options);
    assert.ok(matched.length <= 1, 'no debería devolver más de topK');
  });

  it('clarify-build_NO_debería_matchear_bare_"haz"', async () => {
    const matched = await selectRelevantSkills('haz algo', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      !names.includes('clarify-build'),
      'clarify-build no debería matchear "haz" porque fue removido de triggers',
    );
  });

  it('clarify-build_NO_debería_matchear_bare_"make"', async () => {
    const matched = await selectRelevantSkills('make something', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      !names.includes('clarify-build'),
      'clarify-build no debería matchear "make" porque fue removido de triggers',
    );
  });

  it('clarify-build_NO_debería_matchear_bare_"app"', async () => {
    const matched = await selectRelevantSkills('show me the app', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      !names.includes('clarify-build'),
      'clarify-build no debería matchear "app" porque fue removido de triggers',
    );
  });

  it('clarify-build_NO_debería_matchear_bare_"project"', async () => {
    const matched = await selectRelevantSkills('what is this project', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      !names.includes('clarify-build'),
      'clarify-build no debería matchear "project" porque fue removido de triggers',
    );
  });

  it('clarify-build_SÍ_debería_matchear_"build"', async () => {
    const matched = await selectRelevantSkills('build a calculator', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      names.includes('clarify-build'),
      'clarify-build debería matchear "build" porque está en triggers',
    );
  });

  it('clarify-build_SÍ_debería_matchear_"create"', async () => {
    const matched = await selectRelevantSkills('create an application', mockSkills);
    const names = matched.map((s) => s.name);
    assert.ok(
      names.includes('clarify-build'),
      'clarify-build debería matchear "create" porque está en triggers',
    );
  });
});
