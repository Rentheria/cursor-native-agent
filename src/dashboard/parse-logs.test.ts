import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAgentNdjson,
  parseCronFindings,
  parseMemoryIndex,
} from './parse-logs.js';

describe('parseAgentNdjson', () => {
  it('debería_devolver_entradas_más_recientes_primero', () => {
    const raw = [
      JSON.stringify({
        ts: '2026-08-05T10:00:00.000Z',
        prompt: 'first',
        skillsMatched: [],
        memory: { indexEntries: 2, loadedDetails: [] },
      }),
      JSON.stringify({
        ts: '2026-08-05T11:00:00.000Z',
        prompt: 'second',
        skillsMatched: ['remember'],
        memory: { indexEntries: 2, loadedDetails: ['agent-architecture'] },
      }),
      '',
    ].join('\n');

    const turns = parseAgentNdjson(raw, 10);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]?.prompt, 'second');
    assert.deepEqual(turns[0]?.skillsMatched, ['remember']);
    assert.deepEqual(turns[0]?.memoryLoadedDetails, ['agent-architecture']);
    assert.equal(turns[1]?.prompt, 'first');
  });

  it('debería_respetar_limit_y_ignorar_líneas_malformadas', () => {
    const raw = [
      '{"ts":"a","prompt":"one","skillsMatched":[],"memory":{"indexEntries":0,"loadedDetails":[]}}',
      'not-json',
      '{"ts":"b","prompt":"two","skillsMatched":[],"memory":{"indexEntries":0,"loadedDetails":[]}}',
      '{"ts":"c","prompt":"three","skillsMatched":[],"memory":{"indexEntries":0,"loadedDetails":[]}}',
    ].join('\n');

    const turns = parseAgentNdjson(raw, 2);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]?.prompt, 'three');
    assert.equal(turns[1]?.prompt, 'two');
  });

  it('debería_devolver_vacío_si_el_archivo_está_vacío', () => {
    assert.deepEqual(parseAgentNdjson('', 5), []);
    assert.deepEqual(parseAgentNdjson('   \n', 5), []);
  });

  it('debería_leer_cursorAgentMs_y_totalMs_cuando_existen', () => {
    const raw = `${JSON.stringify({
      ts: '2026-08-07T12:00:00.000Z',
      prompt: 'timed',
      skillsMatched: [],
      memory: { indexEntries: 1, loadedDetails: [] },
      cursorAgentMs: 7500,
      totalMs: 10600,
    })}\n`;
    const turns = parseAgentNdjson(raw, 5);
    assert.equal(turns[0]?.cursorAgentMs, 7500);
    assert.equal(turns[0]?.totalMs, 10600);
  });

  it('debería_leer_reply_y_exitCode_cuando_existen', () => {
    const raw = `${JSON.stringify({
      ts: '2026-08-20T12:00:00.000Z',
      prompt: 'test prompt',
      skillsMatched: ['test-skill'],
      memory: { indexEntries: 1, loadedDetails: [] },
      reply: 'test reply',
      exitCode: 0,
    })}\n`;
    const turns = parseAgentNdjson(raw, 5);
    assert.equal(turns[0]?.reply, 'test reply');
    assert.equal(turns[0]?.exitCode, 0);
  });

  it('debería_manejar_entradas_sin_reply', () => {
    const raw = `${JSON.stringify({
      ts: '2026-08-20T12:00:00.000Z',
      prompt: 'old entry',
      skillsMatched: [],
      memory: { indexEntries: 1, loadedDetails: [] },
    })}\n`;
    const turns = parseAgentNdjson(raw, 5);
    assert.equal(turns[0]?.reply, undefined);
    assert.equal(turns[0]?.exitCode, undefined);
  });

  it('debería_leer_exitCode_distinto_de_cero', () => {
    const raw = `${JSON.stringify({
      ts: '2026-08-20T12:00:00.000Z',
      prompt: 'error case',
      skillsMatched: [],
      memory: { indexEntries: 1, loadedDetails: [] },
      reply: 'error output',
      exitCode: 3,
    })}\n`;
    const turns = parseAgentNdjson(raw, 5);
    assert.equal(turns[0]?.reply, 'error output');
    assert.equal(turns[0]?.exitCode, 3);
  });
});

describe('parseCronFindings', () => {
  const sample = `
=== CRON FINDING 2026-08-05T07:00:02.276Z ===
finished: 2026-08-05T07:00:14.563Z
exit:     0
branch:   feat/showcase-cron-demoable
latest:   8a1330a docs: document showcase skills
tree:     clean
verdict:  READY — working tree clean; safe to show on stage
note:     Clean tree — demo-ready.
===

--- cron tick transcript ---
noise

=== CRON FINDING 2026-08-05T08:00:01.968Z ===
finished: 2026-08-05T08:00:13.392Z
exit:     0
branch:   dev
latest:   8a1330a docs: hello
tree:     dirty (2 paths)
verdict:  DIRTY — 2 path(s) changed; not merge-ready until clean
===
`;

  it('debería_parsear_bloques_CRON_FINDING_más_recientes_primero', () => {
    const findings = parseCronFindings(sample, 10);
    assert.equal(findings.length, 2);
    assert.equal(findings[0]?.startedAt, '2026-08-05T08:00:01.968Z');
    assert.equal(findings[0]?.branch, 'dev');
    assert.equal(findings[0]?.exitCode, 0);
    assert.match(findings[0]?.verdict ?? '', /^DIRTY/);
    assert.equal(findings[0]?.note, undefined);
    assert.equal(findings[1]?.branch, 'feat/showcase-cron-demoable');
    assert.equal(findings[1]?.note, 'Clean tree — demo-ready.');
  });

  it('debería_aplicar_limit', () => {
    const findings = parseCronFindings(sample, 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.branch, 'dev');
  });
});

describe('parseMemoryIndex', () => {
  it('debería_extraer_entradas_del_índice', () => {
    const raw = `# MEMORY

- [Agent architecture](memory/agent-architecture.md) — skills + MEMORY.md lazy-load
- [House git rules](memory/house-git-rules.md) — commit trailer, branches tipo/descripcion
`;
    const entries = parseMemoryIndex(raw);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.title, 'Agent architecture');
    assert.equal(entries[0]?.href, 'memory/agent-architecture.md');
    assert.match(entries[0]?.keywords ?? '', /skills/);
    assert.equal(entries[1]?.title, 'House git rules');
  });
});
