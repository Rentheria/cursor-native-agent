/**
 * Single-instance lock for Telegram long-polling bot.
 * Ensures only one `npm run telegram` process runs at a time on this machine.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface LockOptions {
  readonly repoRoot: string;
  readonly lockFileName?: string;
}

export class TelegramLockError extends Error {
  readonly lockPath: string;
  readonly existingPid: number;

  constructor(lockPath: string, existingPid: number) {
    super(
      [
        'Ya hay otra instancia del bot Telegram corriendo en esta máquina.',
        `Lock: ${lockPath}`,
        `PID existente: ${existingPid}`,
        '',
        'Para detener la otra instancia:',
        `  kill ${existingPid}`,
        '',
        'O si ya está muerta, eliminar el lock:',
        `  rm "${lockPath}"`,
      ].join('\n'),
    );
    this.name = 'TelegramLockError';
    this.lockPath = lockPath;
    this.existingPid = existingPid;
  }
}

/**
 * Acquire an exclusive lock for the Telegram bot poller.
 * Throws TelegramLockError if another process holds the lock and is still running.
 * If the lock file exists but the PID is dead, reclaims the lock.
 */
export async function acquireTelegramLock(options: LockOptions): Promise<TelegramLock> {
  const lockFileName = options.lockFileName ?? '.telegram-poller.lock';
  const lockPath = path.join(options.repoRoot, lockFileName);

  try {
    const content = await fs.readFile(lockPath, 'utf8');
    const existingPid = parseInt(content.trim(), 10);
    
    if (!isNaN(existingPid) && isProcessAlive(existingPid)) {
      throw new TelegramLockError(lockPath, existingPid);
    }
    
    // Lock exists but process is dead; reclaim it
    console.error(`[telegram-lock] Lock existía (PID ${existingPid}) pero el proceso está muerto. Reclamando lock…`);
  } catch (error: unknown) {
    if (error instanceof TelegramLockError) {
      throw error;
    }
    // ENOENT is fine: no existing lock
  }

  const myPid = process.pid;
  await fs.writeFile(lockPath, String(myPid), 'utf8');
  console.error(`[telegram-lock] Lock adquirido: ${lockPath} (PID ${myPid})`);

  return new TelegramLock(lockPath, myPid);
}

/**
 * Release the lock (delete the lock file).
 */
export async function releaseTelegramLock(lock: TelegramLock): Promise<void> {
  try {
    await fs.unlink(lock.lockPath);
    console.error(`[telegram-lock] Lock liberado: ${lock.lockPath}`);
  } catch {
    // Already deleted or never existed; OK
  }
}

export class TelegramLock {
  readonly lockPath: string;
  readonly pid: number;

  constructor(lockPath: string, pid: number) {
    this.lockPath = lockPath;
    this.pid = pid;
  }
}

/**
 * Check if a process with the given PID is alive.
 * Uses process.kill(pid, 0) which doesn't send a signal, just checks existence.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // ESRCH: process does not exist
    return false;
  }
}
