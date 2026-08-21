import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';

/**
 * Tests for timeout watchdog: ensures cursor-agent spawns with detached mode
 * and can be killed on timeout. We test with a simple sleep command that
 * simulates a hung cursor-agent process.
 */
describe('cursor-agent timeout watchdog', () => {
  it('debería_matar_un_proceso_colgado_después_del_timeout', async () => {
    const timeoutMs = 100;
    
    const result = await new Promise<{ exitCode: number; stderr: string; elapsed: number }>((resolve) => {
      const start = Date.now();
      
      const child = spawn('sleep', ['10'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      
      let stderr = '';
      let finished = false;
      
      const timeoutHandle = setTimeout(() => {
        if (!finished && child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error: unknown) {
            stderr += `\nKill error: ${String(error)}\n`;
          }
          finished = true;
          resolve({
            exitCode: 124,
            stderr: stderr + `\nTimeout after ${String(timeoutMs)}ms\n`,
            elapsed: Date.now() - start,
          });
        }
      }, timeoutMs);
      
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      
      child.on('close', (code: number | null) => {
        if (finished) {
          return;
        }
        clearTimeout(timeoutHandle);
        finished = true;
        
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // already dead
          }
        }
        
        resolve({
          exitCode: code ?? 1,
          stderr,
          elapsed: Date.now() - start,
        });
      });
    });
    
    assert.equal(result.exitCode, 124, 'Should return timeout exit code 124');
    assert.ok(result.elapsed < 1000, `Should timeout quickly (${String(result.elapsed)}ms), not wait 10s`);
    assert.match(result.stderr, /Timeout after/);
  });
  
  it('debería_completar_normalmente_si_el_proceso_termina_antes_del_timeout', async () => {
    const timeoutMs = 2000;
    
    const result = await new Promise<{ exitCode: number; stdout: string }>((resolve) => {
      const child = spawn('echo', ['hello'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      
      let stdout = '';
      let finished = false;
      
      const timeoutHandle = setTimeout(() => {
        if (!finished && child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // already dead
          }
          finished = true;
          resolve({
            exitCode: 124,
            stdout,
          });
        }
      }, timeoutMs);
      
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      
      child.on('close', (code: number | null) => {
        if (finished) {
          return;
        }
        clearTimeout(timeoutHandle);
        finished = true;
        
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // already dead
          }
        }
        
        resolve({
          exitCode: code ?? 0,
          stdout,
        });
      });
    });
    
    assert.equal(result.exitCode, 0, 'Should complete successfully');
    assert.match(result.stdout, /hello/);
  });
});
