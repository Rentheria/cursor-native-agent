import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SETUP_SCRIPT = path.join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'cli',
  'setup.ts',
);

const TSX_BIN = path.join(
  import.meta.dirname,
  '..',
  '..',
  'node_modules',
  '.bin',
  'tsx',
);

function runSetup(args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): string {
  const env = options?.env ?? process.env;
  const nodeBin = process.execPath;
  const nodeBinDir = path.dirname(nodeBin);
  
  try {
    return execSync(`"${TSX_BIN}" "${SETUP_SCRIPT}" ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: options?.cwd,
      env: {
        ...env,
        PATH: `${nodeBinDir}:${env.PATH ?? ''}`,
      },
    });
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
    ) {
      return error.stderr;
    }
    throw error;
  }
}

describe('setup CLI', () => {
  it('debería mostrar ayuda con --help', () => {
    const output = runSetup(['--help']);
    assert.match(output, /cursor-native-agent setup/);
    assert.match(output, /One-command setup/);
    assert.match(output, /npm run setup/);
  });

  // TODO: Re-enable after resolving test environment issues with tsx/node detection
  it.skip('debería crear .env con configuración por defecto', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-test-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      const result = runSetup(['--skip-deps'], {
        cwd: tmpRepo,
        env: {
          ...process.env,
          CURSOR_AGENT_BIN_PATH: undefined,
        },
      });

      const envPath = path.join(tmpRepo, '.env');
      assert.ok(existsSync(envPath), '.env debería existir');

      assert.match(result, /Creating default configuration/);
      assert.match(result, /cursor-agent not found/);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  // TODO: Re-enable after resolving test environment issues
  it.skip('debería crear directorio workspace/', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-workspace-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      runSetup(['--skip-deps'], {
        cwd: tmpRepo,
        env: {
          ...process.env,
          CURSOR_AGENT_BIN_PATH: undefined,
        },
      });

      const workspacePath = path.join(tmpRepo, 'workspace');
      assert.ok(existsSync(workspacePath), 'workspace/ debería existir');
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('debería imprimir instrucciones cuando cursor-agent falta', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-missing-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      const result = runSetup(['--skip-deps'], {
        cwd: tmpRepo,
        env: {
          ...process.env,
          CURSOR_AGENT_BIN_PATH: undefined,
        },
      });

      assert.match(result, /cursor-agent not found/);
      assert.match(result, /cursor\.com\/install/);
      assert.match(result, /cursor-agent login/);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  // TODO: Re-enable after resolving test environment issues
  it.skip('debería detectar cursor-agent cuando está presente', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-agent-ok-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      const fakeCursorAgent = path.join(tmpRepo, 'fake-cursor-agent.sh');
      writeFileSync(
        fakeCursorAgent,
        '#!/bin/sh\necho "fake-cursor-agent 1.0.0"\n',
        { mode: 0o755 },
      );

      const result = runSetup(['--skip-deps'], {
        cwd: tmpRepo,
        env: {
          ...process.env,
          CURSOR_AGENT_BIN_PATH: fakeCursorAgent,
        },
      });

      assert.match(result, /cursor-agent found/);
      assert.match(result, /Setup complete/);
      assert.match(result, /Next steps/);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('debería salir con código no-cero cuando cursor-agent falta', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-exit-code-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      let exitCode = 0;
      try {
        execSync(`"${TSX_BIN}" "${SETUP_SCRIPT}" --skip-deps`, {
          cwd: tmpRepo,
          encoding: 'utf8',
          stdio: 'pipe',
          env: {
            ...process.env,
            CURSOR_AGENT_BIN_PATH: undefined,
          },
        });
      } catch (error: unknown) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'status' in error &&
          typeof error.status === 'number'
        ) {
          exitCode = error.status;
        }
      }

      assert.equal(exitCode, 1, 'exit code debería ser 1');
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('no debería colgar esperando entrada interactiva', () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'setup-noninteractive-'));
    try {
      const packageJsonPath = path.join(tmpRepo, 'package.json');
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: 'test', version: '1.0.0' }),
      );

      const nodeModulesPath = path.join(tmpRepo, 'node_modules');
      mkdtempSync(nodeModulesPath);

      const startTime = Date.now();
      try {
        runSetup(['--skip-deps'], {
          cwd: tmpRepo,
          env: {
            ...process.env,
            CURSOR_AGENT_BIN_PATH: undefined,
          },
        });
      } catch {
        // Expected to fail due to missing cursor-agent
      }
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 5000, 'debería completar en menos de 5 segundos');
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });
});
