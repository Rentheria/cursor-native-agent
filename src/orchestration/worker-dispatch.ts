import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WORKER_LOGS_DIRECTORY_NAME } from '../lib/constants.js';
import {
  runCursorAgentLogged,
  type CursorAgentRunResult,
} from '../core/cursor-agent.js';

export interface WorkerDispatchParams {
  readonly ref: string;
  readonly prompt: string;
  readonly repoRoot: string;
  readonly logsDirectory?: string;
  /** Injectable runner for unit tests. */
  readonly runLogged?: (
    options: Parameters<typeof runCursorAgentLogged>[0],
  ) => Promise<CursorAgentRunResult>;
}

export interface WorkerDispatchResult {
  readonly ref: string;
  readonly logPath: string;
  readonly registryPath: string;
  readonly exitCode: number;
  readonly output: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

/**
 * Dispatches a headless `cursor-agent` worker (detached dispatch):
 * log to file → wait until the child exits → parent Promise resolves (= notify).
 * Engine is always `cursor-agent` — no multi-CLI fallback chain.
 */
export async function dispatchWorker(
  params: WorkerDispatchParams,
): Promise<WorkerDispatchResult> {
  const logsDirectory =
    params.logsDirectory ??
    path.join(params.repoRoot, WORKER_LOGS_DIRECTORY_NAME);
  const activeDirectory = path.join(logsDirectory, 'active');
  await mkdir(activeDirectory, { recursive: true });

  const startedAt = new Date().toISOString();
  const stamp = startedAt.replaceAll(/[:.]/g, '-');
  const logPath = path.join(logsDirectory, `${params.ref}-${stamp}.log`);
  const registryPath = path.join(activeDirectory, `${params.ref}.env`);

  await writeFile(
    registryPath,
    [
      `ref=${params.ref}`,
      `repo=${params.repoRoot}`,
      `logfile=${logPath}`,
      `inicio=${String(Math.floor(Date.now() / 1000))}`,
      `inicio_h=${startedAt}`,
      '',
    ].join('\n'),
    'utf8',
  );

  const header = [
    `=== worker ${params.ref} start ${startedAt} ===`,
    `prompt: ${params.prompt}`,
    '',
  ].join('\n');
  await writeFile(logPath, header, 'utf8');

  const runLogged = params.runLogged ?? runCursorAgentLogged;
  const result = await runLogged({
    prompt: params.prompt,
    cwd: params.repoRoot,
    force: true,
    trust: true,
    logPath,
  });

  const finishedAt = new Date().toISOString();
  const footer = [
    '',
    `=== worker ${params.ref} end ${finishedAt} exit=${String(result.exitCode)} ===`,
    '',
  ].join('\n');
  await writeFile(logPath, footer, { encoding: 'utf8', flag: 'a' });

  // Parent "notification": registry cleared once the wait completes successfully.
  await writeFile(
    registryPath,
    [
      `ref=${params.ref}`,
      `repo=${params.repoRoot}`,
      `logfile=${logPath}`,
      `fin_h=${finishedAt}`,
      `fin_rc=${String(result.exitCode)}`,
      `notified=parent-promise`,
      '',
    ].join('\n'),
    'utf8',
  );

  const output = [result.stdout, result.stderr].filter((part) => part.trim() !== '').join('\n');

  return {
    ref: params.ref,
    logPath,
    registryPath,
    exitCode: result.exitCode,
    output,
    startedAt,
    finishedAt,
  };
}

export function buildWorkerReportPrompt(params: {
  readonly userPrompt: string;
  readonly subtask: string;
  readonly worker: WorkerDispatchResult;
}): string {
  return [
    '# Worker dispatch result',
    '',
    'You are the parent Cursor-native agent. A headless worker (`cursor-agent`)',
    'already finished the delegated subtask. Report clearly to the user.',
    '',
    '## Original user request',
    '',
    params.userPrompt,
    '',
    '## Delegated subtask',
    '',
    params.subtask,
    '',
    `## Worker metadata`,
    '',
    `- ref: ${params.worker.ref}`,
    `- exitCode: ${String(params.worker.exitCode)}`,
    `- log: ${params.worker.logPath}`,
    `- started: ${params.worker.startedAt}`,
    `- finished: ${params.worker.finishedAt}`,
    '',
    '## Worker output',
    '',
    params.worker.output.trim() === ''
      ? '_Worker produced no stdout/stderr._'
      : params.worker.output,
    '',
    '## Instructions',
    '',
    'Summarize what the worker did and whether it succeeded. Quote the useful',
    'parts of the worker output. Do not re-run the subtask unless the user asked.',
  ].join('\n');
}
