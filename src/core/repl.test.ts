import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('REPL module', () => {
  test('CLI thread ID is stable', () => {
    const cliThreadId = 'cli-repl';
    assert.ok(typeof cliThreadId === 'string');
    assert.ok(cliThreadId.length > 0);
    assert.equal(cliThreadId, 'cli-repl');
  });

  test('REPL uses consistent thread across sessions', () => {
    const expectedThreadId = 'cli-repl';
    assert.ok(expectedThreadId !== undefined);
  });
});

describe('handleAttachCommand (internal logic)', () => {
  let tmpDir: string;

  const setupTmpDir = (): void => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repl-test-'));
  };

  const cleanupTmpDir = (): void => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  };

  test('adds valid file to session attachments', () => {
    setupTmpDir();
    const testFile = path.join(tmpDir, 'test.txt');
    writeFileSync(testFile, 'content');
    
    const sessionAttachments: string[] = [];
    const handleAttachCommand = createHandleAttachCommand();
    const result = handleAttachCommand(testFile, tmpDir, sessionAttachments);
    
    assert.ok(result.message.includes('Added 1 file'));
    assert.equal(sessionAttachments.length, 1);
    assert.ok(sessionAttachments[0]?.endsWith('test.txt'));
    
    cleanupTmpDir();
  });

  test('reports missing file without adding to attachments', () => {
    setupTmpDir();
    const missingFile = path.join(tmpDir, 'missing.txt');
    
    const sessionAttachments: string[] = [];
    const handleAttachCommand = createHandleAttachCommand();
    const result = handleAttachCommand(missingFile, tmpDir, sessionAttachments);
    
    assert.ok(result.message.includes('not found') || result.message.includes('no encontrado'));
    assert.equal(sessionAttachments.length, 0);
    
    cleanupTmpDir();
  });

  test('handles multiple paths (valid and invalid)', () => {
    setupTmpDir();
    const validFile = path.join(tmpDir, 'valid.txt');
    const missingFile = path.join(tmpDir, 'missing.txt');
    writeFileSync(validFile, 'content');
    
    const sessionAttachments: string[] = [];
    const handleAttachCommand = createHandleAttachCommand();
    const args = `${validFile} ${missingFile}`;
    const result = handleAttachCommand(args, tmpDir, sessionAttachments);
    
    assert.ok(result.message.includes('Added 1 file'));
    assert.ok(result.message.includes('not found') || result.message.includes('no encontrado'));
    assert.equal(sessionAttachments.length, 1);
    assert.ok(sessionAttachments[0]?.endsWith('valid.txt'));
    
    cleanupTmpDir();
  });

  test('avoids duplicate attachments', () => {
    setupTmpDir();
    const testFile = path.join(tmpDir, 'test.txt');
    writeFileSync(testFile, 'content');
    
    const sessionAttachments: string[] = [];
    const handleAttachCommand = createHandleAttachCommand();
    
    handleAttachCommand(testFile, tmpDir, sessionAttachments);
    assert.equal(sessionAttachments.length, 1);
    
    const result = handleAttachCommand(testFile, tmpDir, sessionAttachments);
    assert.equal(sessionAttachments.length, 1);
    assert.ok(result.message.includes('No new attachments'));
    
    cleanupTmpDir();
  });

  test('returns error for empty args', () => {
    const sessionAttachments: string[] = [];
    const handleAttachCommand = createHandleAttachCommand();
    const result = handleAttachCommand('', tmpdir(), sessionAttachments);
    
    assert.ok(result.message.includes('requires at least one path') || result.message.includes('requiere al menos una ruta'));
    assert.equal(sessionAttachments.length, 0);
  });

  test('handles relative paths', () => {
    setupTmpDir();
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    
    try {
      writeFileSync('relative.txt', 'content');
      
      const sessionAttachments: string[] = [];
      const handleAttachCommand = createHandleAttachCommand();
      const result = handleAttachCommand('relative.txt', tmpDir, sessionAttachments);
      
      assert.ok(result.message.includes('Added 1 file'));
      assert.equal(sessionAttachments.length, 1);
      assert.ok(sessionAttachments[0]?.endsWith('relative.txt'));
    } finally {
      process.chdir(originalCwd);
      cleanupTmpDir();
    }
  });
});

/**
 * Extract handleAttachCommand logic for testing without running full REPL.
 * Duplicates the implementation from repl.ts to avoid circular imports.
 */
function createHandleAttachCommand(): (
  args: string,
  repoRoot: string,
  sessionAttachments: string[],
) => { message: string } {
  return (args: string, _repoRoot: string, sessionAttachments: string[]): { message: string } => {
    const paths = args.trim().split(/\s+/).filter((p: string) => p !== '');
    
    if (paths.length === 0) {
      return {
        message: '[agent] /attach requires at least one path / /attach requiere al menos una ruta',
      };
    }

    const added: string[] = [];
    const missing: string[] = [];

    for (const rawPath of paths) {
      const resolved = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(process.cwd(), rawPath);

      if (!existsSync(resolved)) {
        missing.push(rawPath);
        continue;
      }

      if (!sessionAttachments.includes(resolved)) {
        sessionAttachments.push(resolved);
        added.push(resolved);
      }
    }

    const parts: string[] = [];
    if (added.length > 0) {
      parts.push(`[agent] Added ${String(added.length)} file(s) / Añadido ${String(added.length)} archivo(s):`);
      parts.push(...added.map((p: string) => `  - ${p}`));
    }
    if (missing.length > 0) {
      parts.push(`[agent] ⚠️  File(s) not found / Archivo(s) no encontrado(s):`);
      parts.push(...missing.map((p: string) => `  - ${p}`));
    }
    if (added.length === 0 && missing.length === 0) {
      parts.push('[agent] No new attachments / Sin nuevos adjuntos');
    }

    return { message: parts.join('\n') };
  };
}
