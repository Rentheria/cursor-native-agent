import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import os from 'node:os';
import path from 'node:path';

import { CURSOR_AGENT_BINARY } from './constants.js';
import {
  CURSOR_AGENT_BIN_PATH_ENV,
  compareVersionLabels,
  formatCursorAgentSpawnError,
  resolveCursorAgentBinary,
  resolveCursorAgentInvocation,
  sortVersionsNewestFirst,
  type CursorAgentPathFs,
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

describe('sortVersionsNewestFirst', () => {
  it('debería_elegir_la_versión_más_nueva_no_la_primera_alfabética', () => {
    const versions = ['2025.08.01', '2026.01.28-beta', '2025.12.31'];
    assert.deepEqual(sortVersionsNewestFirst(versions), [
      '2026.01.28-beta',
      '2025.12.31',
      '2025.08.01',
    ]);
    assert.ok(compareVersionLabels('1.10.0', '1.2.0') > 0);
    assert.ok(compareVersionLabels('2026.01.09', '2025.12.31') > 0);
  });
});

function memoryFs(files: readonly string[], dirs: Record<string, string[]> = {}): CursorAgentPathFs {
  const fileSet = new Set(files.map((f) => f.replaceAll('/', '\\')));
  const dirMap = new Map(
    Object.entries(dirs).map(([key, names]) => [key.replaceAll('/', '\\'), names]),
  );
  return {
    existsSync: (filePath) => {
      const key = filePath.replaceAll('/', '\\');
      return fileSet.has(key) || dirMap.has(key);
    },
    readdirSync: (dirPath) => dirMap.get(dirPath.replaceAll('/', '\\')) ?? [],
  };
}

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

  it('debería_resolver_wrapper_.cmd_a_node_exe_más_index_js', () => {
    const versionDir = 'C:\\Users\\test\\AppData\\Local\\cursor-agent\\versions\\2026.01.28';
    const wrapperPath = `${versionDir}\\cursor-agent.cmd`;
    const nodeExe = `${versionDir}\\node.exe`;
    const indexJs = `${versionDir}\\index.js`;
    const result = resolveCursorAgentInvocation({
      env: {
        [CURSOR_AGENT_BIN_PATH_ENV]: wrapperPath,
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      },
      platform: 'win32',
      fs: memoryFs([wrapperPath, nodeExe, indexJs]),
    });
    assert.equal(result.command, nodeExe);
    assert.deepEqual(result.prefixArgs, [indexJs]);
  });

  it('NO_debería_devolver_un_shim_.cmd_sin_node_cuando_hay_versión_instalada', () => {
    const root = 'C:\\Users\\test\\AppData\\Local\\cursor-agent';
    const shim = `${root}\\cursor-agent.cmd`;
    const oldDir = `${root}\\versions\\2025.01.01`;
    const newDir = `${root}\\versions\\2026.10.01`;
    const result = resolveCursorAgentInvocation({
      env: {
        [CURSOR_AGENT_BIN_PATH_ENV]: shim,
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      },
      platform: 'win32',
      fs: memoryFs(
        [
          shim,
          `${oldDir}\\cursor-agent.cmd`,
          `${oldDir}\\node.exe`,
          `${oldDir}\\index.js`,
          `${newDir}\\cursor-agent.cmd`,
          `${newDir}\\node.exe`,
          `${newDir}\\index.js`,
        ],
        {
          [`${root}\\versions`]: ['2025.01.01', '2026.10.01'],
        },
      ),
    });
    assert.equal(result.command, `${newDir}\\node.exe`);
    assert.deepEqual(result.prefixArgs, [`${newDir}\\index.js`]);
    assert.ok(!result.command.toLowerCase().endsWith('.cmd'));
  });

  it('debería_elegir_la_versión_más_nueva_entre_varias_instaladas', () => {
    const root = 'C:\\Users\\test\\AppData\\Local\\cursor-agent';
    const oldDir = `${root}\\versions\\2025.08.01`;
    const newDir = `${root}\\versions\\2026.03.15`;
    const result = resolveCursorAgentInvocation({
      env: {
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        HOME: undefined,
        USERPROFILE: 'C:\\Users\\test',
      },
      platform: 'win32',
      fs: memoryFs(
        [
          `${oldDir}\\cursor-agent.cmd`,
          `${oldDir}\\node.exe`,
          `${oldDir}\\index.js`,
          `${newDir}\\cursor-agent.cmd`,
          `${newDir}\\node.exe`,
          `${newDir}\\index.js`,
        ],
        {
          [`${root}\\versions`]: ['2025.08.01', '2026.03.15'],
        },
      ),
    });
    assert.equal(result.command, `${newDir}\\node.exe`);
    assert.deepEqual(result.prefixArgs, [`${newDir}\\index.js`]);
  });

  it('debería_manejar_Windows_.cmd_wrapper_sin_node_en_el_mismo_dir', () => {
    const wrapperPath =
      'C:\\Users\\test\\AppData\\Local\\cursor-agent\\versions\\1.0.0\\cursor-agent.cmd';
    const result = resolveCursorAgentInvocation({
      env: {
        [CURSOR_AGENT_BIN_PATH_ENV]: wrapperPath,
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      },
      platform: 'win32',
      fs: memoryFs([wrapperPath]),
    });
    assert.equal(result.command, wrapperPath);
    assert.deepEqual(result.prefixArgs, []);
  });
});
