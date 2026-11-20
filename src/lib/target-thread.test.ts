import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  DEFAULT_CLI_THREAD_ID,
  isWriteEnvEnabled,
  targetThreadId,
} from './target-thread.js';

describe('targetThreadId', () => {
  it('debería_usar_cli-repl_sin_target', () => {
    assert.equal(targetThreadId(), DEFAULT_CLI_THREAD_ID);
    assert.equal(targetThreadId(''), DEFAULT_CLI_THREAD_ID);
    assert.equal(targetThreadId('   '), DEFAULT_CLI_THREAD_ID);
  });

  it('debería_ser_estable_para_el_mismo_directorio', () => {
    const a = targetThreadId('/tmp/my-app');
    const b = targetThreadId('/tmp/my-app');
    assert.equal(a, b);
    assert.match(a, /^cli-tmp-my-app-[0-9a-f]{10}$/);
  });

  it('debería_diferir_entre_directorios_distintos', () => {
    const left = targetThreadId('/repos/one');
    const right = targetThreadId('/repos/two');
    assert.notEqual(left, right);
  });

  it('debería_resolver_paths_relativos_al_cwd', () => {
    const relative = targetThreadId('src');
    const absolute = targetThreadId(path.resolve('src'));
    assert.equal(relative, absolute);
  });
});

describe('isWriteEnvEnabled', () => {
  it('debería_aceptar_1_true_on_yes', () => {
    assert.equal(isWriteEnvEnabled({ CURSOR_NATIVE_AGENT_WRITE: '1' }), true);
    assert.equal(isWriteEnvEnabled({ CURSOR_NATIVE_AGENT_WRITE: 'true' }), true);
    assert.equal(isWriteEnvEnabled({ CURSOR_NATIVE_AGENT_WRITE: 'ON' }), true);
    assert.equal(isWriteEnvEnabled({ CURSOR_NATIVE_AGENT_WRITE: 'yes' }), true);
    assert.equal(isWriteEnvEnabled({ CURSOR_NATIVE_AGENT_WRITE: '0' }), false);
    assert.equal(isWriteEnvEnabled({}), false);
  });
});
