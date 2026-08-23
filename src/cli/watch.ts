#!/usr/bin/env node
import { watch } from 'chokidar';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from '../lib/load-env.js';

interface WatchOptions {
  readonly dashboard?: boolean;
  readonly repoRoot: string;
}

interface WatchedProcess {
  name: string;
  process: ChildProcess | null;
  scriptPath: string;
  args: string[];
}

const WATCH_PATHS = [
  'src/**/*.ts',
  'src/**/*.js',
  'skills/**/*.md',
  'memory/**/*.md',
  'MEMORY.md',
  '.env',
];

const IGNORE_PATHS = [
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

function clearConsoleAndLog(message: string): void {
  console.clear();
  const timestamp = new Date().toLocaleTimeString('es-MX');
  console.log(`\n[${timestamp}] ${message}\n`);
}

function stopProcess(watched: WatchedProcess): void {
  if (watched.process && !watched.process.killed) {
    console.log(`Deteniendo ${watched.name}...`);
    watched.process.kill('SIGTERM');
    watched.process = null;
  }
}

function startProcess(watched: WatchedProcess, repoRoot: string): void {
  stopProcess(watched);

  console.log(`Iniciando ${watched.name}...`);
  
  const proc = spawn('tsx', [watched.scriptPath, ...watched.args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });

  proc.on('error', (error) => {
    console.error(`Error al iniciar ${watched.name}:`, error.message);
  });

  proc.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM' && code !== null && code !== 0) {
      console.error(`${watched.name} terminó con código ${code}`);
    }
  });

  watched.process = proc;
}

function shouldReloadProcess(
  watched: WatchedProcess,
  changedPath: string,
): boolean {
  if (watched.name === 'dashboard') {
    return (
      changedPath.includes('/src/dashboard/') ||
      changedPath.includes('/src/core/') ||
      changedPath.includes('/src/lib/') ||
      changedPath.includes('/src/loaders/')
    );
  }
  return false;
}

export async function runWatch(options: WatchOptions): Promise<void> {
  const { dashboard, repoRoot } = options;

  loadRepoEnv(repoRoot);

  const processes: WatchedProcess[] = [];

  if (dashboard) {
    processes.push({
      name: 'dashboard',
      process: null,
      scriptPath: path.join(repoRoot, 'src/dashboard/server.ts'),
      args: [],
    });
  }

  for (const watched of processes) {
    startProcess(watched, repoRoot);
  }

  if (processes.length === 0) {
    console.log(`
┌──────────────────────────────────────────────────────────────┐
│  Watch mode activo - Monitoreo de cambios locales           │
│                                                              │
│  Archivos monitoreados:                                      │
│    • src/**/*.ts                                             │
│    • skills/**/*.md                                          │
│    • memory/**/*.md                                          │
│    • MEMORY.md                                               │
│    • .env (nota de reinicio)                                 │
│                                                              │
│  Los cambios en skills y memory se recargan automáticamente │
│  en el siguiente turno del agente (sin reinicio).           │
│                                                              │
│  Para monitorear el dashboard:                               │
│    npm run watch:dashboard                                   │
│                                                              │
│  Presiona Ctrl+C para detener el watch.                     │
└──────────────────────────────────────────────────────────────┘
`);
  }

  const watcher = watch(WATCH_PATHS, {
    ignored: IGNORE_PATHS,
    persistent: true,
    ignoreInitial: true,
    cwd: repoRoot,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', (changedPath) => {
    const relativePath = path.relative(repoRoot, changedPath);
    const isEnvFile = relativePath === '.env';
    const isSkillOrMemory =
      relativePath.startsWith('skills/') ||
      relativePath.startsWith('memory/') ||
      relativePath === 'MEMORY.md';

    if (isEnvFile) {
      clearConsoleAndLog(
        `⚠️  ${relativePath} modificado - considera reiniciar procesos manualmente si cambiaste configuración crítica`,
      );
      return;
    }

    if (isSkillOrMemory) {
      clearConsoleAndLog(
        `✓ ${relativePath} modificado - se recargará en el siguiente turno del agente`,
      );
      return;
    }

    clearConsoleAndLog(`Cambios detectados en ${relativePath}, recargando...`);

    for (const watched of processes) {
      if (shouldReloadProcess(watched, changedPath)) {
        startProcess(watched, repoRoot);
      }
    }
  });

  watcher.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error en el watcher:', message);
  });

  const shutdown = (): void => {
    console.log('\nDeteniendo watch mode...');
    watcher.close().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error cerrando watcher:', message);
    });
    for (const watched of processes) {
      stopProcess(watched);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../..');

  const args = process.argv.slice(2);
  const dashboard = args.includes('--dashboard') || args.includes('-d');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Watch mode - Monitoreo local de cambios

Monitorea archivos del proyecto y recarga procesos automáticamente
cuando detecta cambios. Evita el ciclo de "subir y bajar el proyecto".

Uso:
  npm run watch              Monitor básico (sin procesos)
  npm run watch:dashboard    Monitor + dashboard server

Opciones:
  --dashboard, -d    Iniciar y monitorear dashboard server
  --help, -h         Mostrar esta ayuda

Archivos monitoreados:
  • src/**/*.ts          → Reinicia dashboard si está activo
  • skills/**/*.md       → Se recarga automáticamente (sin reinicio)
  • memory/**/*.md       → Se recarga automáticamente (sin reinicio)
  • MEMORY.md            → Se recarga automáticamente (sin reinicio)
  • .env                 → Nota de reinicio manual (no automático)

Ignorados:
  • node_modules/, logs/, .git/, dist/, workspace/, threads/
  • Archivos de test (*.test.ts)
  • Lock files

Nota sobre skills y memoria:
  Los loaders leen desde disco en cada turno del agente, por lo que
  los cambios en skills/*.md, memory/*.md y MEMORY.md se recogen
  automáticamente sin necesidad de reiniciar procesos.

Presiona Ctrl+C para detener.
`);
    return;
  }

  await runWatch({ dashboard, repoRoot });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[watch] ${message}`);
  process.exitCode = 1;
});
