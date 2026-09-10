import path from 'node:path';

import {
  dispatchWorker,
  type WorkerDispatchParams,
  type WorkerDispatchResult,
} from './worker-dispatch.js';

export interface HarnessTask {
  readonly ref: string;
  readonly role: string;
  readonly prompt: string;
  readonly retries?: number;
}

export interface HarnessConfig {
  readonly tasks: readonly HarnessTask[];
  readonly repoRoot: string;
  readonly mode: 'parallel' | 'sequence';
  readonly logsDirectory?: string;
  readonly globalTimeout?: number;
  readonly defaultRetries?: number;
  /** Injectable runner for unit tests. */
  readonly runLogged?: WorkerDispatchParams['runLogged'];
}

export interface HarnessResult {
  readonly mode: 'parallel' | 'sequence';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly totalMs: number;
  readonly workers: readonly WorkerResult[];
  readonly summary: string;
}

export interface WorkerResult {
  readonly ref: string;
  readonly role: string;
  readonly success: boolean;
  readonly attempts: number;
  readonly exitCode: number;
  readonly output: string;
  readonly logPath: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error?: string;
}

/**
 * Multi-agent run harness: spawns N workers (parallel or sequence),
 * with timeout, retry, and fail isolation. Each worker is a headless
 * cursor-agent turn.
 */
export async function runMultiAgentHarness(
  config: HarnessConfig,
): Promise<HarnessResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const workers =
    config.mode === 'parallel'
      ? await runParallel(config)
      : await runSequence(config);

  const finishedAt = new Date().toISOString();
  const totalMs = Date.now() - startTime;

  const summary = buildSummary(workers, config.mode);

  return {
    mode: config.mode,
    startedAt,
    finishedAt,
    totalMs,
    workers,
    summary,
  };
}

async function runParallel(
  config: HarnessConfig,
): Promise<readonly WorkerResult[]> {
  const promises = config.tasks.map((task) =>
    runTaskWithRetry(task, config).catch((error: unknown) => ({
      ref: task.ref,
      role: task.role,
      success: false,
      attempts: 1,
      exitCode: 1,
      output: '',
      logPath: '',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })),
  );

  return await Promise.all(promises);
}

async function runSequence(
  config: HarnessConfig,
): Promise<readonly WorkerResult[]> {
  const results: WorkerResult[] = [];

  for (const task of config.tasks) {
    try {
      const result = await runTaskWithRetry(task, config);
      results.push(result);
    } catch (error: unknown) {
      results.push({
        ref: task.ref,
        role: task.role,
        success: false,
        attempts: 1,
        exitCode: 1,
        output: '',
        logPath: '',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function runTaskWithRetry(
  task: HarnessTask,
  config: HarnessConfig,
): Promise<WorkerResult> {
  const maxRetries = task.retries ?? config.defaultRetries ?? 0;
  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    try {
      const workerResult = await runTaskOnce(task, config);
      return {
        ref: task.ref,
        role: task.role,
        success: workerResult.exitCode === 0,
        attempts,
        exitCode: workerResult.exitCode,
        output: workerResult.output,
        logPath: workerResult.logPath,
        startedAt: workerResult.startedAt,
        finishedAt: workerResult.finishedAt,
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Unknown error');
}

async function runTaskOnce(
  task: HarnessTask,
  config: HarnessConfig,
): Promise<WorkerDispatchResult> {
  const logsDirectory =
    config.logsDirectory ?? path.join(config.repoRoot, 'logs/workers');

  const fullPrompt = buildTaskPrompt(task);

  const params: WorkerDispatchParams = {
    ref: task.ref,
    prompt: fullPrompt,
    repoRoot: config.repoRoot,
    logsDirectory,
  };

  if (config.runLogged !== undefined) {
    return await dispatchWorker({
      ...params,
      runLogged: config.runLogged,
    });
  }

  return await dispatchWorker(params);
}

function buildTaskPrompt(task: HarnessTask): string {
  return [
    `# Role: ${task.role}`,
    '',
    task.prompt,
  ].join('\n');
}

function buildSummary(
  workers: readonly WorkerResult[],
  mode: 'parallel' | 'sequence',
): string {
  const total = workers.length;
  const successful = workers.filter((w) => w.success).length;
  const failed = total - successful;

  const lines: string[] = [
    `# Multi-agent harness result (mode: ${mode})`,
    '',
    `Total tasks: ${String(total)}`,
    `Successful: ${String(successful)}`,
    `Failed: ${String(failed)}`,
    '',
  ];

  for (const worker of workers) {
    const status = worker.success ? '✓' : '✗';
    lines.push(`${status} ${worker.ref} (${worker.role}) - exit ${String(worker.exitCode)} - ${String(worker.attempts)} attempt(s)`);
    if (worker.error !== undefined) {
      lines.push(`  Error: ${worker.error}`);
    }
    lines.push(`  Log: ${worker.logPath}`);
  }

  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
