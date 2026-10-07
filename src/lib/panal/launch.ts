import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isProtectedBranch, readGitBranch, type GitExec } from './git-branch.js';
import type { LaunchProposal } from './proposal.js';

export type ProcessSpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface LaunchResult {
  readonly ok: boolean;
  readonly refused?: boolean;
  readonly runId?: string;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface LaunchDeps {
  readonly spawnImpl?: ProcessSpawnFn;
  readonly gitExec?: GitExec;
  readonly writeTaskFile?: (dir: string, contents: string) => Promise<string>;
  readonly unlinkTaskFile?: (filePath: string) => Promise<void>;
}

const RUN_ID_PATTERNS = [
  /runs[/\\]([0-9A-Za-z._-]+)\.json/i,
  /\brun(?:\s+id)?[:\s]+([0-9A-Za-z._-]+)/i,
  /\bPANAL_RUN[=\s]+([0-9A-Za-z._-]+)/i,
];

export function buildPanalDelegateArgs(
  proposal: LaunchProposal,
  taskFile: string,
): string[] {
  const chain =
    proposal.agent === 'cursor' && proposal.model !== undefined
      ? `cursor:${proposal.model}`
      : proposal.agent;
  const args = ['delegate', '-d', proposal.dir, '-f', taskFile, '-c', chain];
  if (proposal.mode === 'read-only') {
    args.push('-r');
  }
  args.push('-t', `${String(proposal.timeoutMin)}m`);
  return args;
}

export function buildClaudeArgs(proposal: LaunchProposal): string[] {
  const args = ['-p'];
  if (proposal.mode === 'read-only') {
    args.push('--permission-mode', 'plan');
  }
  return args;
}

export function extractRunId(text: string): string | undefined {
  for (const pattern of RUN_ID_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] !== undefined && match[1].trim() !== '') {
      return match[1].trim();
    }
  }
  return undefined;
}

export function formatLaunchResult(result: LaunchResult): string {
  if (result.refused === true) {
    return result.stderr !== '' ? result.stderr : result.stdout;
  }
  const lines = [
    result.ok ? 'Launch started.' : 'Launch finished with an error.',
    '',
    `- **Command:** \`${result.command}\``,
    `- **Exit:** ${String(result.exitCode)}`,
  ];
  if (result.runId !== undefined) {
    lines.push(`- **Run id:** \`${result.runId}\``);
  }
  const output = [result.stdout, result.stderr]
    .filter((part) => part.trim() !== '')
    .join('\n')
    .trim();
  if (output !== '') {
    lines.push('', output);
  }
  return lines.join('\n');
}

export async function launchConfirmedTask(
  proposal: LaunchProposal,
  deps: LaunchDeps = {},
): Promise<LaunchResult> {
  if (proposal.mode === 'write') {
    const branch = readGitBranch(proposal.dir, deps.gitExec);
    if (isProtectedBranch(branch)) {
      return {
        ok: false,
        refused: true,
        command: '(not launched)',
        stdout: '',
        stderr: `Refusing write launch on protected branch \`${branch ?? 'main'}\`. Switch to a non-main branch or worktree, or use read-only.`,
        exitCode: 2,
      };
    }
  }

  if (proposal.agent === 'claude') {
    return await runClaude(proposal, deps);
  }

  return await runPanalDelegate(proposal, deps);
}

export function resolvePanalCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = env['PANAL_BIN']?.trim();
  if (override !== undefined && override !== '') {
    return override;
  }
  return platform === 'win32' ? 'panal.exe' : 'panal';
}

export function resolveClaudeCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = env['CLAUDE_BIN']?.trim();
  if (override !== undefined && override !== '') {
    return override;
  }
  return platform === 'win32' ? 'claude.exe' : 'claude';
}

async function runPanalDelegate(
  proposal: LaunchProposal,
  deps: LaunchDeps,
): Promise<LaunchResult> {
  const taskFile = await writeTask(proposal.task, deps);
  const args = buildPanalDelegateArgs(proposal, taskFile);
  const command = resolvePanalCommand();
  try {
    const result = await runChild(command, args, proposal.dir, undefined, deps);
    const runId = extractRunId(`${result.stdout}\n${result.stderr}`);
    return {
      ok: result.exitCode === 0,
      ...(runId !== undefined ? { runId } : {}),
      command: formatCommand(command, args),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } finally {
    await safeUnlink(taskFile, deps);
  }
}

async function runClaude(
  proposal: LaunchProposal,
  deps: LaunchDeps,
): Promise<LaunchResult> {
  const command = resolveClaudeCommand();
  const args = buildClaudeArgs(proposal);
  const result = await runChild(command, args, proposal.dir, proposal.task, deps);
  return {
    ok: result.exitCode === 0,
    command: formatCommand(command, args),
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

async function writeTask(task: string, deps: LaunchDeps): Promise<string> {
  if (deps.writeTaskFile !== undefined) {
    return await deps.writeTaskFile(tmpdir(), task);
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'cna-panal-'));
  const filePath = path.join(dir, `task-${randomBytes(4).toString('hex')}.md`);
  await writeFile(filePath, task, 'utf8');
  return filePath;
}

async function safeUnlink(filePath: string, deps: LaunchDeps): Promise<void> {
  try {
    if (deps.unlinkTaskFile !== undefined) {
      await deps.unlinkTaskFile(filePath);
      return;
    }
    await unlink(filePath);
  } catch {
    // temp file cleanup is best-effort
  }
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(' ');
}

async function runChild(
  command: string,
  args: readonly string[],
  cwd: string,
  stdinText: string | undefined,
  deps: LaunchDeps,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const spawnFn = deps.spawnImpl ?? spawn;
  return await new Promise((resolve, reject) => {
    const child = spawnFn(command, [...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    });
    if (stdinText !== undefined) {
      child.stdin?.end(stdinText, 'utf8');
    } else {
      child.stdin?.end();
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

