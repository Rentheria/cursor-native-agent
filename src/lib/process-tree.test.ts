import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isBenignProcessError, killProcessTree } from './process-tree.js';

describe('killProcessTree', () => {
  it('debería_usar_taskkill_T_F_en_Windows', () => {
    const calls: string[][] = [];
    killProcessTree(4242, {
      platform: 'win32',
      taskkill: (args) => {
        calls.push([...args]);
        return { status: 0, stderr: '' };
      },
    });
    assert.deepEqual(calls, [['/T', '/F', '/PID', '4242']]);
  });

  it('debería_silenciar_taskkill_cuando_el_proceso_ya_no_existe', () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      killProcessTree(99, {
        platform: 'win32',
        taskkill: () => ({
          status: 128,
          stderr: 'not found',
          error: Object.assign(new Error('not found'), { code: 'ESRCH' }),
        }),
      });
    } finally {
      console.error = original;
    }
    assert.equal(errors.length, 0);
  });

  it('debería_matar_el_process_group_en_Unix', () => {
    const killed: Array<{ pid: number; signal?: NodeJS.Signals }> = [];
    killProcessTree(77, {
      platform: 'linux',
      kill: (pid, signal) => {
        if (signal !== undefined) {
          killed.push({ pid, signal });
        } else {
          killed.push({ pid });
        }
      },
    });
    assert.deepEqual(killed, [{ pid: -77, signal: 'SIGKILL' }]);
  });

  it('NO_debería_loguear_ESRCH_si_el_grupo_ya_terminó', () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      killProcessTree(12, {
        platform: 'linux',
        kill: () => {
          throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
        },
      });
    } finally {
      console.error = original;
    }
    assert.equal(errors.length, 0);
  });

  it('debería_ignorar_pids_inválidos', () => {
    let called = false;
    killProcessTree(0, {
      platform: 'linux',
      kill: () => {
        called = true;
      },
    });
    killProcessTree(-3, {
      platform: 'win32',
      taskkill: () => {
        called = true;
        return { status: 0, stderr: '' };
      },
    });
    assert.equal(called, false);
  });
});

describe('isBenignProcessError', () => {
  it('debería_reconocer_ESRCH_y_EINVAL', () => {
    assert.equal(isBenignProcessError(Object.assign(new Error('x'), { code: 'ESRCH' })), true);
    assert.equal(isBenignProcessError(Object.assign(new Error('x'), { code: 'EINVAL' })), true);
    assert.equal(isBenignProcessError(new Error('spawn failed')), false);
    assert.equal(isBenignProcessError('nope'), false);
  });
});
