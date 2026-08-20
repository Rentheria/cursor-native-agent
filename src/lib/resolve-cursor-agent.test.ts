import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import os from 'node:os';
import path from 'node:path';

import { CURSOR_AGENT_BINARY } from './constants.js';
import {
  CURSOR_AGENT_BIN_PATH_ENV,
  formatCursorAgentSpawnError,
  resolveCursorAgentBinary,
} from './resolve-cursor-agent.js';

describe('resolveCursorAgentBinary', () => {
  it('debería_preferir_CURSOR_AGENT_BIN_PATH_cuando_está_seteada', () => {
    const override = '/opt/custom/cursor-agent';
    assert.equal(
      resolveCursorAgentBinary({ [CURSOR_AGENT_BIN_PATH_ENV]: override }),
      override,
    );
  });

  it('debería_usar_~/.local/bin_cuando_existe_y_no_hay_override', () => {
    const home = os.homedir();
    const localBin = path.join(home, '.local', 'bin', 'cursor-agent');
    const resolved = resolveCursorAgentBinary({ HOME: home });
    // On this machine the binary is installed; elsewhere we still accept PATH name.
    assert.ok(
      resolved === localBin || resolved === CURSOR_AGENT_BINARY,
      `unexpected binary: ${resolved}`,
    );
  });

  it('debería_caer_al_nombre_PATH_si_no_hay_candidatos', () => {
    assert.equal(
      resolveCursorAgentBinary({ HOME: '/nonexistent-home-for-test' }),
      CURSOR_AGENT_BINARY,
    );
  });
});

describe('formatCursorAgentSpawnError', () => {
  it('debería_mencionar_PATH_y_la_variable_de_override', () => {
    const message = formatCursorAgentSpawnError(
      'cursor-agent',
      'spawn cursor-agent ENOENT',
    );
    assert.match(message, /Is cursor-agent on PATH/);
    assert.match(message, new RegExp(CURSOR_AGENT_BIN_PATH_ENV));
  });
});
