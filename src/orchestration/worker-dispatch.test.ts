import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  buildWorkerReportPrompt,
  dispatchWorker,
} from './worker-dispatch.js';

describe('dispatchWorker', () => {
  it('debería_loguear_esperar_y_notificar_al_padre_cuando_el_worker_termina', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'cna-worker-'));
    try {
      const worker = await dispatchWorker({
        ref: 'T-demo',
        prompt: 'say hi',
        repoRoot: tmp,
        logsDirectory: path.join(tmp, 'logs/workers'),
        runLogged: async (options) => {
          assert.match(options.logPath, /T-demo-/);
          assert.equal(options.prompt, 'say hi');
          assert.equal(options.force, true);
          assert.equal(options.trust, true);
          return {
            stdout: 'worker-ok\n',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      assert.equal(worker.exitCode, 0);
      assert.equal(worker.output, 'worker-ok\n');
      const log = await readFile(worker.logPath, 'utf8');
      assert.match(log, /worker T-demo start/);
      assert.match(log, /exit=0/);
      const registry = await readFile(worker.registryPath, 'utf8');
      assert.match(registry, /notified=parent-promise/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('debería_armar_prompt_de_reporte_con_salida_del_worker', () => {
    const report = buildWorkerReportPrompt({
      userPrompt: 'delega X a un sub-agente',
      subtask: 'X',
      worker: {
        ref: 'w1',
        logPath: '/tmp/w1.log',
        registryPath: '/tmp/active/w1.env',
        exitCode: 0,
        output: 'done',
        startedAt: '2026-08-04T00:00:00.000Z',
        finishedAt: '2026-08-04T00:00:01.000Z',
      },
    });
    assert.match(report, /Delegated subtask/);
    assert.match(report, /\bX\b/);
    assert.match(report, /done/);
  });
});
