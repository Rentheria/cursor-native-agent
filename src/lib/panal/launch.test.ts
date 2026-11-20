import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import type { ChildProcess } from 'node:child_process';

import {
  buildClaudeArgs,
  buildPanalDelegateArgs,
  extractRunId,
  launchConfirmedTask,
} from './launch.js';
import type { LaunchProposal } from './proposal.js';

const base: LaunchProposal = {
  agent: 'cursor',
  mode: 'read-only',
  timeoutMin: 15,
  dir: 'D:\\repos\\app',
  task: 'review the pager',
};

describe('buildPanalDelegateArgs', () => {
  it('debería_armar_delegate_con_-r_y_-t_en_minutos', () => {
    assert.deepEqual(buildPanalDelegateArgs(base, 'C:\\tmp\\task.md'), [
      'delegate',
      '-d',
      'D:\\repos\\app',
      '-f',
      'C:\\tmp\\task.md',
      '-c',
      'cursor',
      '-r',
      '-t',
      '15m',
    ]);
  });

  it('debería_pasar_cursor:model_y_omitir_-r_en_write', () => {
    const args = buildPanalDelegateArgs(
      { ...base, model: 'grok-4.7-high', mode: 'write' },
      '/tmp/task.md',
    );
    assert.deepEqual(args, [
      'delegate',
      '-d',
      'D:\\repos\\app',
      '-f',
      '/tmp/task.md',
      '-c',
      'cursor:grok-4.7-high',
      '-t',
      '15m',
    ]);
  });
});

describe('buildClaudeArgs', () => {
  it('debería_usar_permission-mode_plan_en_read-only', () => {
    assert.deepEqual(buildClaudeArgs(base), ['-p', '--permission-mode', 'plan']);
    assert.deepEqual(buildClaudeArgs({ ...base, mode: 'write' }), ['-p']);
  });
});

describe('extractRunId', () => {
  it('debería_leer_el_id_desde_la_ruta_de_run', () => {
    assert.equal(
      extractRunId('wrote ~/.panal/runs/20261007-211000.123-ab12cd34.json'),
      '20261007-211000.123-ab12cd34',
    );
  });
});

function fakeSpawn(
  stdout: string,
  stderr = '',
  exitCode = 0,
): () => ChildProcess {
  return () => {
    const child = new EventEmitter() as ChildProcess;
    const stdin = new PassThrough();
    const out = new PassThrough();
    const err = new PassThrough();
    Object.assign(child, { stdin, stdout: out, stderr: err, pid: 9 });
    queueMicrotask(() => {
      out.write(stdout);
      err.write(stderr);
      child.emit('close', exitCode);
    });
    return child;
  };
}

describe('launchConfirmedTask', () => {
  it('debería_rechazar_writes_en_main', async () => {
    const result = await launchConfirmedTask(
      { ...base, mode: 'write' },
      {
        gitExec: () => 'main',
        spawnImpl: () => {
          throw new Error('should not spawn');
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.match(result.stderr, /protected branch/);
  });

  it('NO_debería_lanzar_sin_pasar_por_esta_función_confirmada', async () => {
    const result = await launchConfirmedTask(base, {
      gitExec: () => 'feat/pager',
      writeTaskFile: async () => 'C:\\tmp\\task.md',
      unlinkTaskFile: async () => undefined,
      spawnImpl: fakeSpawn('run id: 20261007-ab\nwrote ~/.panal/runs/20261007-ab.json'),
    });
    assert.equal(result.ok, true);
    assert.equal(result.runId, '20261007-ab');
  });

  it('debería_lanzar_claude_con_plan_en_read-only', async () => {
    let seen: { command: string; args: string[] } | undefined;
    const result = await launchConfirmedTask(
      { ...base, agent: 'claude' },
      {
        spawnImpl: (command, args) => {
          seen = { command, args: [...args] };
          return fakeSpawn('plan ready')();
        },
      },
    );
    assert.equal(result.ok, true);
    assert.ok(seen !== undefined);
    assert.match(seen.command, /claude/);
    assert.deepEqual(seen.args, ['-p', '--permission-mode', 'plan']);
  });
});
