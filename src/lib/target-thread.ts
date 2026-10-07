import { createHash } from 'node:crypto';
import path from 'node:path';

export const DEFAULT_CLI_THREAD_ID = 'cli-repl';

/**
 * Stable thread id for a target folder so REPL/one-shot sessions against
 * the same repo keep their own history, while the agent's memory/skills
 * stay in the wrapper repo.
 */
export function targetThreadId(targetDir?: string): string {
  if (targetDir === undefined || targetDir.trim() === '') {
    return DEFAULT_CLI_THREAD_ID;
  }
  const resolved = path.resolve(targetDir.trim());
  const hash = createHash('sha256').update(resolved).digest('hex').slice(0, 10);
  const tail = resolved
    .split(/[\\/]/)
    .filter((part) => part !== '')
    .slice(-2)
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  const slug = tail === '' ? 'target' : tail;
  return `cli-${slug}-${hash}`;
}

export function isWriteEnvEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env['CURSOR_NATIVE_AGENT_WRITE']?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}
