#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { homedir } from 'node:os';

import { loadRepoEnv } from '../lib/load-env.js';
import { ensureDefaultConfig } from '../lib/onboarding.js';
import { resolveCursorAgentBinary } from '../lib/resolve-cursor-agent.js';
import { WORKSPACE_PATH_ENV } from '../lib/constants.js';

interface SetupOptions {
  readonly repoRoot: string;
  readonly skipDeps?: boolean;
}

function showHelp(): void {
  console.log(`
cursor-native-agent setup

One-command setup after cloning the repo.

Usage:
  npm run setup              Install deps, check cursor-agent, create workspace/
  npm run setup -- --help    Show this help
  npm run setup -- -h        Alias for --help

What it does:
  1. Install dependencies (npm install) if needed
  2. Create .env with safe defaults (no Telegram, repo workspace/)
  3. Check cursor-agent is available (PATH or CURSOR_AGENT_BIN_PATH)
  4. Create workspace/ directory for user projects
  5. Print next commands to run

Requirements:
  - Node.js ≥ 20
  - cursor-agent CLI installed and logged in
    Install: curl https://cursor.com/install -fsS | bash
    Login: cursor-agent login
`);
}

/**
 * Expands tilde in paths and returns an absolute path.
 */
function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(homedir(), inputPath.slice(1));
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(inputPath);
}

/**
 * Prompts the user to configure workspace path (Auto = empty/repo workspace, Personalizado = custom path).
 * Returns the workspace path to write to .env (empty string for default).
 */
async function promptForWorkspacePath(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    console.error('');
    console.error('Configuración de workspace (donde se construyen proyectos):');
    const choice = await rl.question(
      'Workspace [auto/personalizado] (Enter = auto → <repo>/workspace): ',
    );
    const trimmed = choice.trim().toLowerCase();

    if (trimmed === '' || trimmed === 'auto' || trimmed === 'a') {
      return '';
    }

    if (trimmed === 'personalizado' || trimmed === 'p') {
      let customPath = await rl.question('  Ruta absoluta o relativa al repo (vacío = <repo>/workspace): ');
      customPath = customPath.trim();
      if (customPath === '') {
        return '';
      }
      return expandPath(customPath);
    }

    return '';
  } finally {
    rl.close();
  }
}

/**
 * Updates the WORKSPACE_PATH in .env (or adds it if missing).
 * If value is empty string, removes WORKSPACE_PATH line or writes it as empty.
 */
function updateWorkspacePathInEnv(repoRoot: string, workspacePath: string): void {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let found = false;
  const updatedLines = lines.map((line) => {
    if (line.startsWith('WORKSPACE_PATH=')) {
      found = true;
      return `WORKSPACE_PATH=${workspacePath}`;
    }
    return line;
  });

  if (!found) {
    const insertIndex = updatedLines.findIndex((line) => line.startsWith('CURSOR_NATIVE_AGENT_ONBOARDED='));
    if (insertIndex >= 0) {
      updatedLines.splice(insertIndex, 0, `WORKSPACE_PATH=${workspacePath}`);
    } else {
      updatedLines.push(`WORKSPACE_PATH=${workspacePath}`);
    }
  }

  writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
}

function checkNodeVersion(): void {
  const nodeMajor = process.versions.node.split('.')[0];
  if (nodeMajor === undefined) {
    throw new Error('Unable to detect Node.js version');
  }
  const major = Number.parseInt(nodeMajor, 10);
  if (major < 20) {
    throw new Error(
      `Node.js ≥ 20 required. Current: ${process.version}. Please upgrade Node.js.`,
    );
  }
}

function installDepsIfNeeded(repoRoot: string): void {
  const nodeModulesPath = path.join(repoRoot, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    console.error('[setup] Dependencies already installed');
    return;
  }

  console.error('[setup] Installing dependencies...');
  try {
    execSync('npm install', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (error) {
    throw new Error(
      `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function checkCursorAgent(): { found: boolean; binary?: string } {
  try {
    const binary = resolveCursorAgentBinary();
    const version = execSync(`"${binary}" --version`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (typeof version === 'string' && version.trim() !== '') {
      return { found: true, binary };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

function printCursorAgentInstallInstructions(): void {
  const isWindows = process.platform === 'win32';
  console.error('');
  console.error('❌ cursor-agent not found on PATH');
  console.error('');
  console.error('The cursor-agent CLI is required to run this project.');
  console.error('');
  console.error('Install cursor-agent:');
  if (isWindows) {
    console.error('  PowerShell:');
    console.error("    irm 'https://cursor.com/install?win32=true' | iex");
  } else {
    console.error('  macOS / Linux / WSL:');
    console.error('    curl https://cursor.com/install -fsS | bash');
  }
  console.error('');
  console.error('Then log in:');
  console.error('  cursor-agent login');
  console.error('');
  console.error('Docs: https://cursor.com/docs/cli/installation');
  console.error('');
  console.error(
    'If cursor-agent is installed but not on PATH, set CURSOR_AGENT_BIN_PATH:',
  );
  console.error('  export CURSOR_AGENT_BIN_PATH=/path/to/cursor-agent');
  console.error('');
}

/**
 * Resolves the workspace path from env or defaults to repoRoot/workspace.
 */
function resolveWorkspacePath(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envPath = env[WORKSPACE_PATH_ENV];
  if (envPath !== undefined && envPath.trim() !== '') {
    return path.isAbsolute(envPath) ? envPath : path.resolve(repoRoot, envPath);
  }
  return path.join(repoRoot, 'workspace');
}

/**
 * Ensures the resolved workspace directory exists.
 */
function ensureWorkspaceDir(repoRoot: string): void {
  const workspacePath = resolveWorkspacePath(repoRoot);
  if (existsSync(workspacePath)) {
    console.error('[setup] Workspace directory already exists');
    return;
  }

  console.error('[setup] Creating workspace directory...');
  mkdirSync(workspacePath, { recursive: true });
  console.error(`[setup] Created ${workspacePath}`);
}

function printNextSteps(): void {
  console.error('');
  console.error('✅ Setup complete!');
  console.error('');
  console.error('🔐 Token de autenticación guardado en .env como DASHBOARD_TOKEN.');
  console.error('   (No se imprime en la terminal por seguridad)');
  console.error('');
  console.error('Próximos pasos:');
  console.error('');
  console.error('  1. Probar el agente con un prompt:');
  console.error('     npm run agent -- "summarize file MEMORY.md"');
  console.error('');
  console.error('  2. Abrir el dashboard con chat:');
  console.error('     npm run dashboard');
  console.error('     Luego abrí http://127.0.0.1:3847/');
  console.error('     → Chat funciona directo; el token ya está en sesión');
  console.error('     → Si borraste cookies: pegá DASHBOARD_TOKEN desde .env en "Desbloquear"');
  console.error('');
  console.error('  3. Opcional: Configurar bot de Telegram');
  console.error('     npm run onboard');
  console.error('     (o exportá TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHAT_IDS)');
  console.error('');
  console.error('  4. Opcional: Instalar tick de salud semanal');
  console.error('     npm run cron:install');
  console.error('     (corre --check-only; notifica a Telegram solo cuando hay issues)');
  console.error('');
  printSecurityReminder();
  console.error('');
  console.error('Más info: README.md y TUTORIAL.md');
  console.error('');
}

function printSecurityReminder(): void {
  console.error('📌 Qué debes saber:');
  console.error('');
  console.error('  • Dashboard solo en 127.0.0.1; chat requiere DASHBOARD_TOKEN de .env');
  console.error('  • Agente corre con --trust; dashboard/Telegram piden Confirmar antes de escribir');
  console.error('  • Nunca commitees .env (token, Telegram). threads/ y workspace/ están en .gitignore');
  console.error('  • Telegram opcional; falla cerrado sin allowlist');
  console.error('');
  console.error('  Para uso personal — cada quien lo corre en su propia máquina.');
  console.error('');
}

async function runSetup(options: SetupOptions): Promise<void> {
  const { repoRoot } = options;

  console.error('');
  console.error('=== cursor-native-agent setup ===');
  console.error('');

  checkNodeVersion();

  if (!options.skipDeps) {
    installDepsIfNeeded(repoRoot);
  }

  console.error('[setup] Creating default configuration...');
  const created = ensureDefaultConfig(repoRoot);
  if (!created) {
    console.error('[setup] Configuration already exists');
  }

  // Interactive workspace path prompt if TTY and .env exists
  const envPath = path.join(repoRoot, '.env');
  if (input.isTTY && existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const hasWorkspacePath = /^WORKSPACE_PATH=.+$/m.test(content);
    
    // Only prompt if WORKSPACE_PATH is missing or ask if user wants to update
    if (!hasWorkspacePath) {
      console.error('[setup] WORKSPACE_PATH no está configurado en .env');
      const workspacePath = await promptForWorkspacePath();
      updateWorkspacePathInEnv(repoRoot, workspacePath);
      console.error(`[setup] WORKSPACE_PATH guardado en .env: ${workspacePath === '' ? '<repo>/workspace (default)' : workspacePath}`);
    }
  }

  const cursorAgentCheck = checkCursorAgent();
  if (!cursorAgentCheck.found) {
    printCursorAgentInstallInstructions();
    process.exitCode = 1;
    return;
  }

  console.error(
    `[setup] cursor-agent found: ${cursorAgentCheck.binary ?? 'cursor-agent'}`,
  );

  ensureWorkspaceDir(repoRoot);

  printNextSteps();
}

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../..');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);

  await runSetup({
    repoRoot,
    skipDeps: args.includes('--skip-deps'),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[setup] ${message}`);
  process.exitCode = 1;
});
