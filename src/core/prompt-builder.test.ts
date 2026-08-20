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
    });

    assert.match(assembled.finalPrompt, /Memory index/);
    assert.match(assembled.finalPrompt, /house-git-rules/);
    assert.match(assembled.finalPrompt, /Skill: git-commit/);
    assert.match(assembled.finalPrompt, /Draft a commit for the skills loader/);
  });
});
