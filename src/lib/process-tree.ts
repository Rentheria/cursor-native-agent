import { spawnSync } from 'node:child_process';

export type ProcessKiller = (pid: number, signal?: NodeJS.Signals) => void;

export type TaskKillRunner = (
  args: readonly string[],
) => {
  readonly error?: Error;
  readonly status: number | null;
  readonly stderr: string;
};

export interface KillProcessTreeOptions {
  readonly platform?: NodeJS.Platform;
  readonly kill?: ProcessKiller;
  readonly taskkill?: TaskKillRunner;
}

function isProcessGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ESRCH' || code === 'EINVAL';
}

function defaultTaskKill(args: readonly string[]): {
  readonly error?: Error;
  readonly status: number | null;
  readonly stderr: string;
} {
  const result = spawnSync('taskkill', [...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status,
    stderr: result.stderr,
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}

/**
 * Kills a child and its descendants. On Windows uses `taskkill /T /F`;
 * on Unix sends SIGKILL to the process group, then the pid.
 *
 * ESRCH / already-dead processes are silent — callers often invoke this
 * after the child has already exited.
 */
export function killProcessTree(
  pid: number,
  options: KillProcessTreeOptions = {},
): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    const run = options.taskkill ?? defaultTaskKill;
    const result = run(['/T', '/F', '/PID', String(pid)]);
    if (result.error !== undefined && !isProcessGone(result.error)) {
      const message = result.error.message;
      if (!/not found|no running|ESRCH/i.test(message)) {
        console.error(`[cursor-agent] taskkill failed for pid ${String(pid)}: ${message}`);
      }
    }
    return;
  }

  const kill = options.kill ?? process.kill.bind(process);
  try {
    kill(-pid, 'SIGKILL');
  } catch (error: unknown) {
    if (!isProcessGone(error)) {
      console.error(`[cursor-agent] Failed to kill process group -${String(pid)}:`, error);
      return;
    }
    try {
      kill(pid, 'SIGKILL');
    } catch (fallbackError: unknown) {
      if (!isProcessGone(fallbackError)) {
        console.error(
          `[cursor-agent] Failed to kill process ${String(pid)}:`,
          fallbackError,
        );
      }
    }
  }
}

/** True when a spawn/kill error is the noisy "already gone" case. */
export function isBenignProcessError(error: unknown): boolean {
  return isProcessGone(error);
}
