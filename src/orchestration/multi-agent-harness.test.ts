import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { runMultiAgentHarness } from './multi-agent-harness.js';

describe('runMultiAgentHarness', () => {
  it('debería_ejecutar_múltiples_tareas_en_paralelo_con_éxito', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      let callCount = 0;

      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-1', role: 'coder', prompt: 'write code' },
          { ref: 'task-2', role: 'reviewer', prompt: 'review code' },
        ],
        repoRoot: tmp,
        mode: 'parallel',
        runLogged: async (_options) => {
          callCount++;
          return {
            stdout: `output-${callCount}`,
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(result.mode, 'parallel');
      assert.equal(result.workers.length, 2);
      assert.equal(result.workers[0]?.success, true);
      assert.equal(result.workers[1]?.success, true);
      assert.match(result.summary, /Successful: 2/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_ejecutar_múltiples_tareas_en_secuencia_con_éxito', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      const executionOrder: string[] = [];

      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-1', role: 'planner', prompt: 'plan' },
          { ref: 'task-2', role: 'executor', prompt: 'execute' },
        ],
        repoRoot: tmp,
        mode: 'sequence',
        runLogged: async (options) => {
          executionOrder.push(options.prompt);
          return {
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(result.mode, 'sequence');
      assert.equal(result.workers.length, 2);
      assert.match(executionOrder[0] ?? '', /planner/);
      assert.match(executionOrder[1] ?? '', /executor/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_reintentar_tareas_fallidas_según_configuración', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      let attemptCount = 0;

      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-retry', role: 'flaky', prompt: 'test', retries: 2 },
        ],
        repoRoot: tmp,
        mode: 'parallel',
        runLogged: async () => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Simulated failure');
          }
          return {
            stdout: 'success after retry',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(result.workers.length, 1);
      assert.equal(result.workers[0]?.success, true);
      assert.equal(result.workers[0]?.attempts, 2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_aislar_fallos_sin_matar_al_padre_en_modo_paralelo', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-ok', role: 'worker-1', prompt: 'succeed' },
          { ref: 'task-fail', role: 'worker-2', prompt: 'fail' },
          { ref: 'task-ok-2', role: 'worker-3', prompt: 'succeed' },
        ],
        repoRoot: tmp,
        mode: 'parallel',
        runLogged: async (options) => {
          if (options.prompt.includes('fail')) {
            return {
              stdout: '',
              stderr: 'error',
              exitCode: 1,
            };
          }
          return {
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(result.workers.length, 3);
      const successCount = result.workers.filter((w) => w.success).length;
      const failCount = result.workers.filter((w) => !w.success).length;
      assert.equal(successCount, 2);
      assert.equal(failCount, 1);
      assert.match(result.summary, /Successful: 2/);
      assert.match(result.summary, /Failed: 1/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_aislar_fallos_sin_matar_al_padre_en_modo_secuencia', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-1', role: 'first', prompt: 'ok' },
          { ref: 'task-2', role: 'second', prompt: 'fail' },
          { ref: 'task-3', role: 'third', prompt: 'ok' },
        ],
        repoRoot: tmp,
        mode: 'sequence',
        runLogged: async (options) => {
          if (options.prompt.includes('fail')) {
            throw new Error('Task exploded');
          }
          return {
            stdout: 'done',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(result.workers.length, 3);
      assert.equal(result.workers[0]?.success, true);
      assert.equal(result.workers[1]?.success, false);
      assert.equal(result.workers[2]?.success, true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_construir_prompt_con_role_en_el_encabezado', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      let capturedPrompt = '';

      await runMultiAgentHarness({
        tasks: [{ ref: 't1', role: 'custom-role', prompt: 'do work' }],
        repoRoot: tmp,
        mode: 'parallel',
        runLogged: async (options) => {
          capturedPrompt = options.prompt;
          return {
            stdout: '',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.match(capturedPrompt, /# Role: custom-role/);
      assert.match(capturedPrompt, /do work/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_reportar_tiempo_total_y_resumen_correctamente', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-harness-'));
    try {
      const result = await runMultiAgentHarness({
        tasks: [
          { ref: 'task-1', role: 'worker', prompt: 'work' },
        ],
        repoRoot: tmp,
        mode: 'parallel',
        runLogged: async () => ({
          stdout: '',
          stderr: '',
          exitCode: 0,
        }),
      });

      assert(result.totalMs >= 0);
      assert(result.startedAt);
      assert(result.finishedAt);
      assert.match(result.summary, /mode: parallel/);
      assert.match(result.summary, /Total tasks: 1/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
