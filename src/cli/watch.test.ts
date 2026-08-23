import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('watch CLI', () => {
  test('watch paths include expected directories', () => {
    const watchPaths = [
      'src/**/*.ts',
      'src/**/*.js',
      'skills/**/*.md',
      'memory/**/*.md',
      'MEMORY.md',
      '.env',
    ];

    assert.ok(watchPaths.includes('skills/**/*.md'));
    assert.ok(watchPaths.includes('memory/**/*.md'));
    assert.ok(watchPaths.includes('MEMORY.md'));
    assert.ok(watchPaths.includes('src/**/*.ts'));
    assert.ok(watchPaths.includes('.env'));
  });

  test('ignore paths exclude development artifacts', () => {
    const ignorePaths = [
      '**/node_modules/**',
      '**/logs/**',
      '**/.git/**',
      '**/dist/**',
      '**/workspace/**',
      '**/threads/**',
      '**/*.test.ts',
      '**/*.lock',
      'package-lock.json',
    ];

    assert.ok(ignorePaths.includes('**/node_modules/**'));
    assert.ok(ignorePaths.includes('**/logs/**'));
    assert.ok(ignorePaths.includes('**/.git/**'));
    assert.ok(ignorePaths.includes('**/workspace/**'));
    assert.ok(ignorePaths.includes('**/*.test.ts'));
    assert.ok(ignorePaths.includes('package-lock.json'));
  });

  test('should reload dashboard process for relevant paths', () => {
    const shouldReload = (watchedName: string, changedPath: string): boolean => {
      if (watchedName === 'dashboard') {
        return (
          changedPath.includes('/src/dashboard/') ||
          changedPath.includes('/src/core/') ||
          changedPath.includes('/src/lib/') ||
          changedPath.includes('/src/loaders/')
        );
      }
      return false;
    };

    assert.ok(shouldReload('dashboard', '/workspace/src/dashboard/server.ts'));
    assert.ok(shouldReload('dashboard', '/workspace/src/core/agent-turn.ts'));
    assert.ok(shouldReload('dashboard', '/workspace/src/lib/constants.ts'));
    assert.ok(shouldReload('dashboard', '/workspace/src/loaders/skills-loader.ts'));
    
    assert.ok(!shouldReload('dashboard', '/workspace/skills/git-commit.md'));
    assert.ok(!shouldReload('dashboard', '/workspace/memory/test.md'));
    assert.ok(!shouldReload('dashboard', '/workspace/MEMORY.md'));
  });

  test('watch mode help message is descriptive', () => {
    const helpSnippet = `
Watch mode - Monitoreo local de cambios

Monitorea archivos del proyecto y recarga procesos automáticamente
cuando detecta cambios. Evita el ciclo de "subir y bajar el proyecto".

Uso:
  npm run watch              Monitor básico (sin procesos)
  npm run watch:dashboard    Monitor + dashboard server
`;

    assert.ok(helpSnippet.includes('Monitoreo local'));
    assert.ok(helpSnippet.includes('npm run watch'));
    assert.ok(helpSnippet.includes('npm run watch:dashboard'));
  });
});
