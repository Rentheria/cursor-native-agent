import { spawn } from 'node:child_process';
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
import {
  formatCursorAgentSpawnError,
  resolveCursorAgentBinary,
} from '../lib/resolve-cursor-agent.js';
import { parseStreamJsonLine } from './stream-json.js';

export interface CursorAgentRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

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
}

/**
 * Invokes `cursor-agent -p "<prompt>"` (plus optional headless flags) and
 * captures stdout/stderr. This is the real Cursor engine — not a mock.
 */
export async function runCursorAgent(
  promptOrOptions: string | CursorAgentRunOptions,
): Promise<CursorAgentRunResult> {
  const options =
    typeof promptOrOptions === 'string'
      ? { prompt: promptOrOptions }
      : promptOrOptions;

  const args = buildCursorAgentArgs(options, process.env);
  const binary = resolveCursorAgentBinary();
  logCursorAgentCall(binary, args);

  return await new Promise<CursorAgentRunResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      cwd: options.cwd,
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let streamResultText = '';
    let finished = false;
    
    const timeoutMs = resolveTimeoutMs(process.env);
    const timeoutHandle = setTimeout(() => {
      if (!finished && child.pid !== undefined) {
        console.error(`[cursor-agent] Timeout after ${String(timeoutMs)}ms, killing process group -${String(child.pid)}`);
        killProcessGroup(child.pid);
        finished = true;
        resolve({
          stdout: options.streamJson === true ? streamResultText : stdout,
          stderr: stderr + '\n[cursor-agent wrapper] Timeout: killed process group after ' + String(timeoutMs) + 'ms\n',
          exitCode: 124,
        });
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
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
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      finished = true;
      reject(
        new Error(formatCursorAgentSpawnError(binary, error.message), {
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
      
      if (child.pid !== undefined) {
        killProcessGroup(child.pid);
      }
      
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
      resolve({
        stdout: options.streamJson === true ? streamResultText : stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Same as {@link runCursorAgent}, but tees stdout/stderr into a log file
 * (detached worker: background process leaves a durable transcript).
 */
export async function runCursorAgentLogged(
  options: CursorAgentRunOptions & { readonly logPath: string },
): Promise<CursorAgentRunResult> {
  await mkdir(path.dirname(options.logPath), { recursive: true });
  const args = buildCursorAgentArgs(options, process.env);
  const binary = resolveCursorAgentBinary();
  logCursorAgentCall(binary, args);

  return await new Promise<CursorAgentRunResult>((resolve, reject) => {
    const logStream = createWriteStream(options.logPath, { flags: 'a' });
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      cwd: options.cwd,
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    
    const timeoutMs = resolveTimeoutMs(process.env);
    const timeoutHandle = setTimeout(() => {
      if (!finished && child.pid !== undefined) {
        const timeoutMsg = `\n[cursor-agent wrapper] Timeout: killed process group after ${String(timeoutMs)}ms\n`;
        console.error(`[cursor-agent] Timeout after ${String(timeoutMs)}ms, killing process group -${String(child.pid)}`);
        logStream.write(timeoutMsg);
        killProcessGroup(child.pid);
        finished = true;
        logStream.end();
        resolve({
          stdout,
          stderr: stderr + timeoutMsg,
          exitCode: 124,
        });
      }
    }, timeoutMs);

    const append = (chunk: Buffer, target: 'stdout' | 'stderr'): void => {
      const text = chunk.toString('utf8');
      if (target === 'stdout') {
        stdout += text;
      } else {
        stderr += text;
      }
      logStream.write(text);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      append(chunk, 'stdout');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      append(chunk, 'stderr');
    });
    child.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      finished = true;
      logStream.end();
      reject(
        new Error(formatCursorAgentSpawnError(binary, error.message), {
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
      
      if (child.pid !== undefined) {
        killProcessGroup(child.pid);
      }
      
      logStream.end();
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export function buildCursorAgentArgs(
  options: CursorAgentRunOptions,
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
  args.push(options.prompt);
  return args;
}

function resolveModelArg(env: NodeJS.ProcessEnv): string | undefined {
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

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error: unknown) {
    console.error(`[cursor-agent] Failed to kill process group -${String(pid)}:`, error);
  }
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
  console.error(`[cursor-agent] Calling ${binary}${modelArg}`);
}
