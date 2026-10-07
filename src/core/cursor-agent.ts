import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  CURSOR_AGENT_FORCE_FLAG,
  CURSOR_AGENT_MODEL_ENV,
  CURSOR_AGENT_PRINT_FLAG,
  CURSOR_AGENT_TRUST_FLAG,
  CURSOR_AGENT_TIMEOUT_ENV,
  DEFAULT_CURSOR_AGENT_TIMEOUT_MS,
} from '../lib/constants.js';
import { killProcessTree } from '../lib/process-tree.js';
import {
  formatCursorAgentSpawnError,
  resolveCursorAgentInvocation,
} from '../lib/resolve-cursor-agent.js';
import { parseStreamJsonLine } from './stream-json.js';

export interface CursorAgentRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type CursorAgentSpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface CursorAgentRunOptions {
  readonly prompt: string;
  readonly cwd?: string;
  /** Non-interactive: allow shell commands unless denied. */
  readonly force?: boolean;
  /** Non-interactive: trust workspace without prompting. */
  readonly trust?: boolean;
  /** Optional mode flag value, e.g. `ask` for read-only Q&A. */
  readonly mode?: 'ask' | 'plan';
  /** Optional chat ID to resume */
  readonly resumeChatId?: string;
  /**
   * Opt-in: `--output-format stream-json --stream-partial-output`.
   * When set, `stdout` is the final assistant text (from the `result` event),
   * not the raw NDJSON stream.
   */
  readonly streamJson?: boolean;
  /** Called for each partial assistant text delta (only with `streamJson`). */
  readonly onAssistantDelta?: (text: string) => void;
  /** Injectable spawn for tests. */
  readonly spawnImpl?: CursorAgentSpawnFn;
  /** Injectable process-tree killer for tests. */
  readonly killImpl?: (pid: number) => void;
}

/**
 * Invokes `cursor-agent -p` and writes the assembled prompt on stdin.
 * The prompt is never passed as a command-line argument (Windows CreateProcess
 * caps the full command line at ~32K chars — `spawn ENAMETOOLONG`).
 */
export async function runCursorAgent(
  promptOrOptions: string | CursorAgentRunOptions,
): Promise<CursorAgentRunResult> {
  const options =
    typeof promptOrOptions === 'string'
      ? { prompt: promptOrOptions }
      : promptOrOptions;

  return await runCursorAgentProcess(options);
}

/**
 * Same as {@link runCursorAgent}, but tees stdout/stderr into a log file
 * (detached worker: background process leaves a durable transcript).
 */
export async function runCursorAgentLogged(
  options: CursorAgentRunOptions & { readonly logPath: string },
): Promise<CursorAgentRunResult> {
  await mkdir(path.dirname(options.logPath), { recursive: true });
  return await runCursorAgentProcess(options, options.logPath);
}

/**
 * Flags only — the prompt is sent on stdin, never as argv.
 */
export function buildCursorAgentArgs(
  options: Omit<CursorAgentRunOptions, 'prompt'> | CursorAgentRunOptions,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const args: string[] = [CURSOR_AGENT_PRINT_FLAG];
  if (options.force === true) {
    args.push(CURSOR_AGENT_FORCE_FLAG);
  }
  if (options.trust === true) {
    args.push(CURSOR_AGENT_TRUST_FLAG);
  }
  if (options.mode !== undefined) {
    args.push('--mode', options.mode);
  }
  if (options.resumeChatId !== undefined) {
    args.push('--resume', options.resumeChatId);
  }
  if (options.streamJson === true) {
    args.push('--output-format', 'stream-json', '--stream-partial-output');
  }
  const model = resolveModelArg(env);
  if (model !== undefined) {
    args.push('--model', model);
  }
  return args;
}

export function resolveModelArg(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env[CURSOR_AGENT_MODEL_ENV]?.trim();
  if (raw === undefined || raw === '' || raw.toLowerCase() === 'auto') {
    return undefined;
  }
  return raw;
}

function resolveTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = env[CURSOR_AGENT_TIMEOUT_ENV]?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_CURSOR_AGENT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_CURSOR_AGENT_TIMEOUT_MS : parsed;
}

async function runCursorAgentProcess(
  options: CursorAgentRunOptions,
  logPath?: string,
): Promise<CursorAgentRunResult> {
  const args = buildCursorAgentArgs(options, process.env);
  const invocation = resolveCursorAgentInvocation();
  const spawnArgs = [...invocation.prefixArgs, ...args];
  logCursorAgentCall(invocation.command, spawnArgs);

  const spawnFn = options.spawnImpl ?? spawn;
  const kill = options.killImpl ?? killProcessTree;
  const platform = process.platform;

  return await new Promise<CursorAgentRunResult>((resolve, reject) => {
    const logStream =
      logPath !== undefined
        ? createWriteStream(logPath, { flags: 'a' })
        : undefined;

    const child = spawnFn(invocation.command, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      cwd: options.cwd,
      detached: platform !== 'win32',
      windowsHide: true,
    });

    writePromptToStdin(child, options.prompt);

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let streamResultText = '';
    let finished = false;

    const timeoutMs = resolveTimeoutMs(process.env);
    const timeoutHandle = setTimeout(() => {
      if (finished) {
        return;
      }
      if (child.pid !== undefined) {
        console.error(
          `[cursor-agent] Timeout after ${String(timeoutMs)}ms, killing process tree ${String(child.pid)}`,
        );
        kill(child.pid);
      }
      finished = true;
      const timeoutMsg = `\n[cursor-agent wrapper] Timeout: killed process tree after ${String(timeoutMs)}ms\n`;
      logStream?.write(timeoutMsg);
      logStream?.end();
      resolve({
        stdout: options.streamJson === true ? streamResultText : stdout,
        stderr: stderr + timeoutMsg,
        exitCode: 124,
      });
    }, timeoutMs);

    const onStdout = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      logStream?.write(text);
      if (options.streamJson === true) {
        lineBuffer = consumeStreamJsonChunk(
          lineBuffer,
          text,
          options.onAssistantDelta,
          (resultText) => {
            streamResultText = resultText;
          },
        );
      } else {
        stdout += text;
      }
    };

    const onStderr = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      stderr += text;
      logStream?.write(text);
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      finished = true;
      logStream?.end();
      reject(
        new Error(formatCursorAgentSpawnError(invocation.command, error.message), {
          cause: error,
        }),
      );
    });
    child.on('close', (code: number | null) => {
      if (finished) {
        return;
      }
      clearTimeout(timeoutHandle);
      finished = true;
      if (options.streamJson === true && lineBuffer.trim() !== '') {
        consumeStreamJsonChunk(
          '',
          `${lineBuffer}\n`,
          options.onAssistantDelta,
          (resultText) => {
            streamResultText = resultText;
          },
        );
      }
      logStream?.end();
      resolve({
        stdout: options.streamJson === true ? streamResultText : stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export function writePromptToStdin(child: Pick<ChildProcess, 'stdin'>, prompt: string): void {
  const stdin = child.stdin;
  if (stdin === null || stdin === undefined) {
    return;
  }
  stdin.on('error', () => {
    // Child may exit before the full prompt is written (EPIPE). Harmless.
  });
  stdin.end(prompt, 'utf8');
}

function consumeStreamJsonChunk(
  priorBuffer: string,
  chunk: string,
  onAssistantDelta: ((text: string) => void) | undefined,
  onResultText: (text: string) => void,
): string {
  const combined = priorBuffer + chunk;
  const lines = combined.split('\n');
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const parsed = parseStreamJsonLine(line);
    if (parsed.assistantDelta !== undefined) {
      onAssistantDelta?.(parsed.assistantDelta);
    }
    if (parsed.resultText !== undefined) {
      onResultText(parsed.resultText);
    }
  }

  return rest;
}

function logCursorAgentCall(binary: string, args: string[]): void {
  const modelIdx = args.indexOf('--model');
  const modelArg =
    modelIdx >= 0 && modelIdx + 1 < args.length
      ? ` --model ${args[modelIdx + 1]}`
      : '';
  console.error(`[cursor-agent] Calling ${binary}${modelArg} (prompt via stdin)`);
}
