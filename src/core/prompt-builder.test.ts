import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assemblePrompt } from './prompt-builder.js';
import type { MemoryLoadResult, SkillDocument } from '../lib/types.js';

describe('assemblePrompt', () => {
  it('debería_incluir_índice_skill_y_prompt_del_usuario', () => {
    const skill: SkillDocument = {
      name: 'git-commit',
      description: 'commits',
      triggers: ['commit'],
      body: 'Do conventional commits.',
      filePath: '/tmp/git-commit.md',
    };
    const memory: MemoryLoadResult = {
      indexMarkdown: '- [Rules](memory/house-git-rules.md) — branches tipo/descripcion',
      indexEntries: [],
      details: [],
    };

    const assembled = assemblePrompt({
      userPrompt: 'Draft a commit for the skills loader',
      matchedSkills: [skill],
      memory,
      repoRoot: '/workspace',
    });

    assert.match(assembled.finalPrompt, /Memory index/);
    assert.match(assembled.finalPrompt, /house-git-rules/);
    assert.match(assembled.finalPrompt, /Skill: git-commit/);
    assert.match(assembled.finalPrompt, /Draft a commit for the skills loader/);
  });

  it('añade_constraint_crítico_cuando_stage_pitch_está_activo', () => {
    const stagePitchSkill: SkillDocument = {
      name: 'stage-pitch',
      description: 'pitch',
      triggers: ['pitch', 'qué hace este repo'],
      body: 'Give a 30-second pitch.',
      filePath: '/tmp/stage-pitch.md',
    };
    const memory: MemoryLoadResult = {
      indexMarkdown: '- README',
      indexEntries: [],
      details: [],
    };

    const assembled = assemblePrompt({
      userPrompt: 'qué hace este repo',
      matchedSkills: [stagePitchSkill],
      memory,
      repoRoot: '/workspace',
    });

    assert.match(assembled.finalPrompt, /CRITICAL OUTPUT CONSTRAINT/);
    assert.match(assembled.finalPrompt, /30-second stage pitch/);
    assert.match(assembled.finalPrompt, /EXACTLY three beats/);
    assert.match(assembled.finalPrompt, /≤12 lines total/);
    assert.match(assembled.finalPrompt, /Hook.*Proof.*Close/s);
  });

  it('no_añade_constraint_cuando_stage_pitch_no_está_activo', () => {
    const otherSkill: SkillDocument = {
      name: 'git-commit',
      description: 'commits',
      triggers: ['commit'],
      body: 'Do commits.',
      filePath: '/tmp/git-commit.md',
    };
    const memory: MemoryLoadResult = {
      indexMarkdown: '- README',
      indexEntries: [],
      details: [],
    };

    const assembled = assemblePrompt({
      userPrompt: 'draft a commit',
      matchedSkills: [otherSkill],
      memory,
      repoRoot: '/workspace',
    });

    assert.ok(!assembled.finalPrompt.includes('CRITICAL OUTPUT CONSTRAINT'));
    assert.ok(!assembled.finalPrompt.includes('30-second stage pitch'));
  });

  it('funciona_cuando_no_hay_skills_activos', () => {
    const memory: MemoryLoadResult = {
      indexMarkdown: '- README',
      indexEntries: [],
      details: [],
    };

    const assembled = assemblePrompt({
      userPrompt: 'random question',
      matchedSkills: [],
      memory,
      repoRoot: '/workspace',
    });

    assert.ok(!assembled.finalPrompt.includes('CRITICAL OUTPUT CONSTRAINT'));
    assert.match(assembled.finalPrompt, /No skills matched/);
  });

  it('debería_incluir_workspace_path_y_repo_root_cuando_están_disponibles', () => {
    const memory: MemoryLoadResult = {
      indexMarkdown: '- README',
      indexEntries: [],
      details: [],
    };

    const assembled = assemblePrompt({
      userPrompt: 'cuál es el workspace path',
      matchedSkills: [],
      memory,
      workspacePath: '/workspace/build',
      repoRoot: '/workspace',
    });

    assert.match(assembled.finalPrompt, /Build workspace \(WORKSPACE_PATH\)/);
    assert.match(assembled.finalPrompt, /\/workspace\/build/);
    assert.match(assembled.finalPrompt, /Repo root/);
    assert.match(assembled.finalPrompt, /\/workspace/);
    assert.match(assembled.finalPrompt, /workspace path.*path de trabajo.*directorio de trabajo/s);
    assert.match(assembled.finalPrompt, /Do NOT invent paths/);
  });
});
