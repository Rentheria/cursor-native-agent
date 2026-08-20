import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import {
  collectRepoHealth,
  describeHealthDelta,
  diffRepoHealth,
  evaluateRepoHealth,
  formatHealthReport,
  parseSnapshot,
  readPreviousSnapshot,
  writeSnapshot,
  type RepoFacts,
  type RepoHealthSnapshot,
} from './repo-health.js';

const execFileAsync = promisify(execFile);

const healthyFacts: RepoFacts = {
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
  facts: RepoFacts,
  collectedAt: string,
): RepoHealthSnapshot {
  return { ...facts, collectedAt, issues: evaluateRepoHealth(facts) };
}

describe('evaluateRepoHealth', () => {
  it('debería_no_reportar_nada_en_un_repo_sano', () => {
    assert.deepEqual(evaluateRepoHealth(healthyFacts), []);
  });

  it('debería_detectar_un_link_roto_del_índice_de_memoria', () => {
    const issues = evaluateRepoHealth({
      ...healthyFacts,
      indexedMemoryPaths: ['memory/gone.md'],
      memoryDocuments: [],
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, 'error');
    assert.equal(issues[0]?.id, 'memory-index-broken-link:memory/gone.md');
    assert.match(issues[0]?.message ?? '', /does not exist/);
  });

  it('debería_detectar_un_detalle_de_memoria_sin_entrada_en_el_índice', () => {
    const issues = evaluateRepoHealth({
      ...healthyFacts,
      memoryDocuments: [
        ...healthyFacts.memoryDocuments,
        { relativePath: 'memory/huerfano.md', loadError: null },
      ],
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, 'warn');
    assert.equal(issues[0]?.id, 'memory-unindexed:memory/huerfano.md');
  });

  it('debería_detectar_documentos_que_no_cargarían_en_un_turno', () => {
    const issues = evaluateRepoHealth({
      ...healthyFacts,
      skillDocuments: [
        { relativePath: 'skills/roto.md', loadError: 'missing frontmatter "name"' },
      ],
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, 'error');
    assert.match(issues[0]?.message ?? '', /skills\/roto\.md fails to load/);
  });

  it('debería_contar_los_paths_sucios_del_working_tree', () => {
    const issues = evaluateRepoHealth({
      ...healthyFacts,
      dirtyPaths: [' M README.md', '?? memory/nuevo.md'],
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.id, 'git-dirty');
    assert.match(issues[0]?.message ?? '', /2 path\(s\) uncommitted/);
  });

  it('debería_ordenar_errores_antes_que_warnings', () => {
    const issues = evaluateRepoHealth({
      ...healthyFacts,
      dirtyPaths: [' M README.md'],
      indexedMemoryPaths: ['memory/gone.md'],
      memoryDocuments: [],
    });
    assert.deepEqual(
      issues.map((issue) => issue.severity),
      ['error', 'warn'],
    );
  });
});

describe('diffRepoHealth', () => {
  it('debería_tratar_el_primer_tick_como_sin_baseline', () => {
    const current = snapshotOf(healthyFacts, '2026-08-11T06:00:00.000Z');
    const delta = diffRepoHealth(null, current);
    assert.equal(delta.previousCollectedAt, null);
    assert.deepEqual(describeHealthDelta(delta), [
      'first tick on this machine — no previous snapshot to compare against',
    ]);
  });

  it('debería_reportar_issues_nuevos_resueltos_y_cambiados', () => {
    const previous = snapshotOf(
      {
        ...healthyFacts,
        dirtyPaths: [' M README.md'],
        skillDocuments: [
          { relativePath: 'skills/roto.md', loadError: 'missing frontmatter "name"' },
        ],
      },
      '2026-08-11T05:00:00.000Z',
    );
    const current = snapshotOf(
      {
        ...healthyFacts,
        dirtyPaths: [' M README.md', '?? memory/nuevo.md'],
        memoryDocuments: [
          ...healthyFacts.memoryDocuments,
          { relativePath: 'memory/nuevo.md', loadError: null },
        ],
        head: 'def5678 feat: nuevo',
      },
      '2026-08-11T06:00:00.000Z',
    );

    const delta = diffRepoHealth(previous, current);
    assert.equal(delta.headChanged, true);
    assert.deepEqual(
      delta.newIssues.map((issue) => issue.id),
      ['memory-unindexed:memory/nuevo.md'],
    );
    assert.deepEqual(
      delta.resolvedIssues.map((issue) => issue.id),
      ['document-unloadable:skills/roto.md'],
    );
    assert.deepEqual(
      delta.changedIssues.map((issue) => issue.id),
      ['git-dirty'],
    );

    const described = describeHealthDelta(delta).join('\n');
    assert.match(described, /head moved from "abc1234 docs: hello"/);
    assert.match(described, /new \[warn\] memory\/nuevo\.md is not listed/);
    assert.match(described, /resolved \[error\] skills\/roto\.md fails to load/);
    assert.match(described, /changed \[warn\] working tree is dirty: 2 path/);
  });

  it('debería_decir_explícitamente_cuando_nada_cambió', () => {
    const previous = snapshotOf(healthyFacts, '2026-08-11T05:00:00.000Z');
    const current = snapshotOf(healthyFacts, '2026-08-11T06:00:00.000Z');
    assert.deepEqual(describeHealthDelta(diffRepoHealth(previous, current)), [
      'no change since 2026-08-11T05:00:00.000Z',
    ]);
  });
});

describe('formatHealthReport', () => {
  it('debería_incluir_evidencia_concreta_para_el_prompt', () => {
    const previous = snapshotOf(healthyFacts, '2026-08-11T05:00:00.000Z');
    const current = snapshotOf(
      {
        ...healthyFacts,
        dirtyPaths: ['?? memory/nuevo.md'],
        memoryDocuments: [
          ...healthyFacts.memoryDocuments,
          { relativePath: 'memory/nuevo.md', loadError: null },
        ],
      },
      '2026-08-11T06:00:00.000Z',
    );

    const report = formatHealthReport(current, diffRepoHealth(previous, current));
    assert.match(report, /branch:\s+dev/);
    assert.match(report, /tree:\s+dirty \(1 path\(s\)\)/);
    assert.match(report, /issues:\s+2 \(0 error, 2 warn\)/);
    assert.match(report, /- \[warn\] memory\/nuevo\.md is not listed/);
    assert.match(report, /changes since previous tick:/);
    assert.match(report, /git status --short:\n {2}\?\? memory\/nuevo\.md/);
  });
});

describe('snapshot persistence', () => {
  it('debería_round_trip_el_snapshot_en_disco', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-health-'));
    const snapshot = snapshotOf(
      { ...healthyFacts, dirtyPaths: [' M README.md'] },
      '2026-08-11T06:00:00.000Z',
    );

    assert.equal(await readPreviousSnapshot(repoRoot), null);
    await writeSnapshot(repoRoot, snapshot);
    assert.deepEqual(await readPreviousSnapshot(repoRoot), snapshot);
  });

  it('debería_degradar_a_null_con_estado_corrupto', () => {
    assert.equal(parseSnapshot('not json'), null);
    assert.equal(parseSnapshot('{"collectedAt": 42}'), null);
  });
});

describe('collectRepoHealth (disco real)', () => {
  it('debería_encontrar_los_problemas_reales_de_un_repo_de_prueba', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-collect-'));
    await mkdir(path.join(repoRoot, 'memory'), { recursive: true });
    await mkdir(path.join(repoRoot, 'skills'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'MEMORY.md'),
      [
        '# MEMORY',
        '',
        '- [Presente](memory/presente.md) — algo que sí existe',
        '- [Ausente](memory/ausente.md) — algo que no existe',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(repoRoot, 'memory/presente.md'),
      '---\nname: presente\ndescription: existe\n---\n\ncuerpo\n',
      'utf8',
    );
    await writeFile(
      path.join(repoRoot, 'memory/huerfano.md'),
      '---\nname: huerfano\ndescription: sin índice\n---\n\ncuerpo\n',
      'utf8',
    );
    await writeFile(
      path.join(repoRoot, 'skills/roto.md'),
      '---\nname: roto\n---\n\nsin description ni triggers\n',
      'utf8',
    );

    const snapshot = await collectRepoHealth(
      repoRoot,
      new Date('2026-08-11T06:00:00.000Z'),
    );

    assert.equal(snapshot.collectedAt, '2026-08-11T06:00:00.000Z');
    assert.deepEqual(snapshot.indexedMemoryPaths, [
      'memory/presente.md',
      'memory/ausente.md',
    ]);
    assert.deepEqual(
      snapshot.issues.map((issue) => issue.id).toSorted(),
      [
        'document-unloadable:skills/roto.md',
        // The temp dir is not a git repo, and that must not look like dirt.
        'git-unavailable',
        'memory-index-broken-link:memory/ausente.md',
        'memory-unindexed:memory/huerfano.md',
      ],
    );
    assert.deepEqual(snapshot.dirtyPaths, []);
    assert.match(
      snapshot.issues.find((issue) => issue.id.startsWith('document-unloadable'))
        ?.message ?? '',
      /"description", "triggers"/,
    );
  });

  it('debería_leer_branch_head_y_paths_sucios_de_un_repo_git_real', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-git-'));
    await mkdir(path.join(repoRoot, 'memory'), { recursive: true });
    await mkdir(path.join(repoRoot, 'skills'), { recursive: true });
    await writeFile(path.join(repoRoot, 'MEMORY.md'), '# MEMORY\n', 'utf8');
    await git(repoRoot, ['init', '--initial-branch=dev']);
    await git(repoRoot, ['add', '.']);
    await git(repoRoot, [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'chore: baseline',
    ]);

    const committed = await collectRepoHealth(repoRoot);
    assert.equal(committed.gitError, null);
    assert.equal(committed.branch, 'dev');
    assert.match(committed.head, /chore: baseline$/);
    assert.deepEqual(committed.dirtyPaths, []);
    assert.deepEqual(committed.issues, []);

    await writeFile(path.join(repoRoot, 'MEMORY.md'), '# MEMORY\n\nedit\n', 'utf8');
    const dirty = await collectRepoHealth(repoRoot);
    assert.deepEqual(dirty.dirtyPaths, [' M MEMORY.md']);
    assert.deepEqual(
      dirty.issues.map((issue) => issue.id),
      ['git-dirty'],
    );
  });
});

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', [...args], { cwd });
}
