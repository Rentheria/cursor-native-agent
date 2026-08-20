import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CRON_TICK_PROMPT_PREFIX,
  buildCronTickPrompt,
  deriveCronVerdict,
  formatCronFinding,
  parseAgentTriage,
} from './cron-tick.js';
import {
  diffRepoHealth,
  evaluateRepoHealth,
  type RepoFacts,
  type RepoHealthSnapshot,
} from './repo-health.js';

const baseFacts: RepoFacts = {
  branch: 'dev',
  head: 'abc1234 docs: hello',
  dirtyPaths: [],
  gitError: null,
  indexedMemoryPaths: ['memory/agent-architecture.md'],
  memoryDocuments: [
    { relativePath: 'memory/agent-architecture.md', loadError: null },
  ],
  skillDocuments: [{ relativePath: 'skills/git-commit.md', loadError: null }],
};

function snapshotOf(
  overrides: Partial<RepoFacts>,
  collectedAt = '2026-08-11T06:00:00.000Z',
): RepoHealthSnapshot {
  const facts = { ...baseFacts, ...overrides };
  return { ...facts, collectedAt, issues: evaluateRepoHealth(facts) };
}

const cleanSnapshot = snapshotOf({});
const brokenSnapshot = snapshotOf({
  indexedMemoryPaths: ['memory/gone.md'],
  memoryDocuments: [],
  dirtyPaths: [' M README.md'],
});

describe('cron tick prompt', () => {
  it('debería_pedir_triage_sobre_el_reporte_de_salud_real', () => {
    const prompt = buildCronTickPrompt(
      brokenSnapshot,
      diffRepoHealth(null, brokenSnapshot),
    );
    assert.match(prompt, new RegExp(CRON_TICK_PROMPT_PREFIX));
    assert.match(prompt, /FINDING:/);
    assert.match(prompt, /ACTION:/);
    assert.match(prompt, /branch:\s+dev/);
    assert.match(prompt, /memory\/gone\.md/);
  });

  it('debería_cambiar_el_prompt_cuando_cambia_el_estado_del_repo', () => {
    const before = buildCronTickPrompt(
      cleanSnapshot,
      diffRepoHealth(null, cleanSnapshot),
    );
    const after = buildCronTickPrompt(
      brokenSnapshot,
      diffRepoHealth(cleanSnapshot, brokenSnapshot),
    );
    assert.notEqual(before, after);
    assert.match(after, /new \[error\] MEMORY\.md links memory\/gone\.md/);
  });
});

describe('deriveCronVerdict', () => {
  it('debería_ser_READY_solo_sin_hallazgos', () => {
    assert.match(deriveCronVerdict(cleanSnapshot), /^READY/);
  });

  it('debería_ser_WARN_con_solo_advertencias', () => {
    assert.match(
      deriveCronVerdict(snapshotOf({ dirtyPaths: [' M README.md'] })),
      /^WARN — 1 warning/,
    );
  });

  it('debería_ser_BROKEN_cuando_algo_rompería_un_turno', () => {
    assert.match(deriveCronVerdict(brokenSnapshot), /^BROKEN — 1 error/);
  });
});

describe('parseAgentTriage', () => {
  it('debería_extraer_FINDING_y_ACTION', () => {
    assert.deepEqual(
      parseAgentTriage(
        'FINDING: memory/gone.md is linked but missing\nACTION: remove the index line\n',
      ),
      {
        finding: 'memory/gone.md is linked but missing',
        action: 'remove the index line',
      },
    );
  });

  it('debería_caer_a_la_primera_línea_si_el_agente_no_sigue_el_contrato', () => {
    assert.deepEqual(parseAgentTriage('  todo bien por acá  \n'), {
      finding: 'todo bien por acá',
      action: undefined,
    });
    assert.deepEqual(parseAgentTriage('   \n  '), {
      finding: undefined,
      action: undefined,
    });
  });
});

describe('cron finding (demoable)', () => {
  it('debería_listar_los_hallazgos_y_el_delta_del_tick', () => {
    const block = formatCronFinding({
      startedAt: '2026-08-11T06:00:00.000Z',
      finishedAt: '2026-08-11T06:00:08.000Z',
      exitCode: 0,
      snapshot: brokenSnapshot,
      delta: diffRepoHealth(cleanSnapshot, brokenSnapshot),
      triage: {
        finding: 'the index points at a deleted memory file',
        action: 'drop the memory/gone.md line from MEMORY.md',
      },
    });

    assert.match(block, /^=== CRON FINDING 2026-08-11T06:00:00\.000Z ===/m);
    // Field names the dashboard parser depends on.
    assert.match(block, /latest:\s+abc1234 docs: hello/);
    assert.match(block, /tree:\s+dirty \(1 path\(s\)\)/);
    assert.match(block, /checked:\s+0 memory file\(s\), 1 skill\(s\)/);
    assert.match(block, /issues:\s+2 \(1 error, 1 warn\)/);
    assert.match(block, /- \[error\] MEMORY\.md links memory\/gone\.md/);
    assert.match(block, /- new \[error\] MEMORY\.md links memory\/gone\.md/);
    assert.match(block, /verdict:\s+BROKEN/);
    assert.match(block, /note:\s+the index points at a deleted memory file/);
    assert.match(block, /action:\s+drop the memory\/gone\.md line/);
    assert.match(block, /^===$/m);
  });

  it('debería_marcar_el_tick_check_only_sin_inventar_triage', () => {
    const block = formatCronFinding({
      startedAt: '2026-08-11T06:00:00.000Z',
      finishedAt: '2026-08-11T06:00:01.000Z',
      exitCode: undefined,
      snapshot: cleanSnapshot,
      delta: diffRepoHealth(cleanSnapshot, cleanSnapshot),
      triage: { finding: undefined, action: undefined },
    });

    assert.match(block, /exit:\s+\(check-only\)/);
    assert.match(block, /tree:\s+clean/);
    assert.match(block, /verdict:\s+READY/);
    assert.match(block, /- no change since 2026-08-11T06:00:00\.000Z/);
    assert.doesNotMatch(block, /^note:/m);
    assert.doesNotMatch(block, /^action:/m);
  });
});
