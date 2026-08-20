import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  appendAgentNdjson,
  buildTurnDebugReport,
  isDebugEnabled,
  stripDebugFlags,
} from './debug.js';
import type { MemoryLoadResult, SkillDocument } from '../lib/types.js';

describe('debug helpers', () => {
  it('debería_detectar_flag_debug_y_env', () => {
    assert.equal(isDebugEnabled(['--debug', 'hola'], {}), true);
    assert.equal(isDebugEnabled(['-d'], {}), true);
    assert.equal(isDebugEnabled(['hola'], { CURSOR_NATIVE_AGENT_DEBUG: '1' }), true);
    assert.equal(isDebugEnabled(['hola'], {}), false);
  });

  it('debería_quitar_flags_debug_del_argv', () => {
    assert.deepEqual(stripDebugFlags(['--debug', 'draft', 'a', 'commit', '-d']), [
      'draft',
      'a',
      'commit',
    ]);
  });

  it('debería_reportar_por_qué_matcheó_cada_skill', () => {
    const skills: SkillDocument[] = [
      {
        name: 'git-commit',
        description: 'commits',
        triggers: ['commit', 'git commit'],
        body: 'body',
        filePath: 'skills/git-commit.md',
      },
      {
        name: 'explain-error',
        description: 'errors',
        triggers: ['error', 'crash'],
        body: 'body',
        filePath: 'skills/explain-error.md',
      },
    ];
    const memory: MemoryLoadResult = {
      indexMarkdown: '# MEMORY',
      indexEntries: [],
      details: [],
    };
    const matched = [skills[0]!];
    const report = buildTurnDebugReport({
      prompt: 'please draft a commit',
      allSkills: skills,
      matchedSkills: matched,
      memory,
    });
    assert.equal(report.skillsMatched.length, 1);
    assert.equal(report.skillsEvaluated[0]?.matched, true);
    assert.deepEqual(report.skillsEvaluated[0]?.matchedTriggers, ['commit']);
    assert.equal(report.skillsEvaluated[1]?.matched, false);
  });

  it('debería_appendear_ndjson_en_logs', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-debug-'));
    try {
      const report = buildTurnDebugReport({
        prompt: 'hola',
        allSkills: [],
        matchedSkills: [],
        memory: { indexMarkdown: '', indexEntries: [], details: [] },
      });
      await appendAgentNdjson(tmp, report);
      const raw = await readFile(path.join(tmp, 'logs/agent.ndjson'), 'utf8');
      const line = JSON.parse(raw.trim()) as { prompt: string };
      assert.equal(line.prompt, 'hola');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
