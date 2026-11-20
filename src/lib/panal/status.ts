import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { resolvePanalCommand } from './launch.js';

export type StatusSpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface PanalStatusResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export const PANAL_LIST_ARGS = ['-history'] as const;
export const PANAL_DASHBOARD_ARGS = ['-once'] as const;

export function buildPanalListArgs(): string[] {
  return [...PANAL_LIST_ARGS];
}

export function buildPanalDashboardArgs(): string[] {
  return [...PANAL_DASHBOARD_ARGS];
}

export async function listPanalRuns(
  spawnImpl: StatusSpawnFn = spawn,
): Promise<PanalStatusResult> {
  const command = resolvePanalCommand();
  const history = await runPanal(command, buildPanalListArgs(), spawnImpl);
  if (history.exitCode === 0 || history.stdout.trim() !== '') {
    return history;
  }
  return await runPanal(command, buildPanalDashboardArgs(), spawnImpl);
}

export function formatPanalStatus(result: PanalStatusResult): string {
  const body = [result.stdout, result.stderr]
    .filter((part) => part.trim() !== '')
    .join('\n')
    .trim();
  if (body === '') {
    return result.ok
      ? 'No panal runs found (`panal -history`).'
      : `Failed to list panal runs (exit ${String(result.exitCode)}). Is \`panal\` on PATH?`;
  }
  return body;
}

async function runPanal(
  command: string,
  args: readonly string[],
  spawnImpl: StatusSpawnFn,
): Promise<PanalStatusResult> {
  return await new Promise((resolve) => {
    const child = spawnImpl(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      resolve({
        ok: false,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
