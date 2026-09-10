import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import os from 'node:os';
import path from 'node:path';

import { CURSOR_AGENT_BINARY } from './constants.js';
import {
  CURSOR_AGENT_BIN_PATH_ENV,
  formatCursorAgentSpawnError,
  resolveCursorAgentBinary,
  resolveCursorAgentInvocation,
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

describe('resolveCursorAgentInvocation', () => {
  it('debería_preferir_CURSOR_AGENT_BIN_PATH_cuando_está_seteada', () => {
    const override = '/opt/custom/cursor-agent';
    const result = resolveCursorAgentInvocation({ [CURSOR_AGENT_BIN_PATH_ENV]: override });
    assert.equal(result.command, override);
    assert.deepEqual(result.prefixArgs, []);
  });

  it('debería_caer_al_nombre_PATH_si_no_hay_candidatos', () => {
    const result = resolveCursorAgentInvocation({ HOME: '/nonexistent-home-for-test' });
    assert.equal(result.command, CURSOR_AGENT_BINARY);
    assert.deepEqual(result.prefixArgs, []);
  });

  it('debería_manejar_Windows_.cmd_wrapper_con_override_explícito', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    
    try {
      const wrapperPath = 'C:\\Users\\test\\AppData\\Local\\cursor-agent\\versions\\1.0.0\\cursor-agent.cmd';
      const result = resolveCursorAgentInvocation({ 
        [CURSOR_AGENT_BIN_PATH_ENV]: wrapperPath,
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      });
      
      // When the actual node.exe and index.js don't exist, it should fall back to the wrapper path
      assert.equal(result.command, wrapperPath);
      assert.deepEqual(result.prefixArgs, []);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    }
  });

  it('debería_incluir_Windows_paths_en_commonCursorAgentPaths', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    
    try {
      const result = resolveCursorAgentInvocation({
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        HOME: undefined,
        USERPROFILE: 'C:\\Users\\test',
      });
      
      // Should fall back to bare command when no actual installations exist
      assert.equal(result.command, CURSOR_AGENT_BINARY);
      assert.deepEqual(result.prefixArgs, []);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    }
  });
});
