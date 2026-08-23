import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acquireTelegramLock,
  releaseTelegramLock,
  TelegramLockError,
} from './telegram-lock.js';

describe('telegram-lock', () => {
  it('debería_adquirir_y_liberar_un_lock_nuevo', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-lock-test-'));
    try {
      const lock = await acquireTelegramLock({ repoRoot });
      assert.equal(lock.pid, process.pid);
      assert.ok(lock.lockPath.includes('.telegram-poller.lock'));
      
      await releaseTelegramLock(lock);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('debería_fallar_si_otro_proceso_vivo_tiene_el_lock', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-lock-test-'));
    try {
      const lock1 = await acquireTelegramLock({ repoRoot });
      
      // Intentar adquirir el lock desde el mismo proceso (simula otro proceso)
      await assert.rejects(
        () => acquireTelegramLock({ repoRoot }),
        (error: unknown) => {
          assert.ok(error instanceof TelegramLockError);
          assert.equal(error.existingPid, process.pid);
          assert.match(error.message, /otra instancia/i);
          assert.match(error.message, /kill/);
          return true;
        },
      );
      
      await releaseTelegramLock(lock1);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('debería_reclamar_lock_si_el_pid_está_muerto', async () => {
    const { writeFile } = await import('node:fs/promises');
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-lock-test-'));
    try {
      const lockPath = join(repoRoot, '.telegram-poller.lock');
      
      // Escribir un PID que seguramente no existe (999999)
      await writeFile(lockPath, '999999', 'utf8');
      
      // Debería reclamar el lock sin fallar
      const lock = await acquireTelegramLock({ repoRoot });
      assert.equal(lock.pid, process.pid);
      
      await releaseTelegramLock(lock);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('debería_usar_lockFileName_custom_si_se_provee', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-lock-test-'));
    try {
      const lock = await acquireTelegramLock({
        repoRoot,
        lockFileName: 'custom-lock.txt',
      });
      assert.ok(lock.lockPath.includes('custom-lock.txt'));
      
      await releaseTelegramLock(lock);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('releaseTelegramLock_no_debe_fallar_si_el_archivo_no_existe', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-lock-test-'));
    try {
      const lock = await acquireTelegramLock({ repoRoot });
      await releaseTelegramLock(lock);
      
      // Segunda liberación no debe fallar
      await releaseTelegramLock(lock);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
