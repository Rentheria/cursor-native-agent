#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from '../lib/load-env.js';
import { ensureDefaultConfig } from '../lib/onboarding.js';
import { resolveCursorAgentBinary } from '../lib/resolve-cursor-agent.js';

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

function ensureWorkspaceDir(repoRoot: string): void {
  const workspacePath = path.join(repoRoot, 'workspace');
  if (existsSync(workspacePath)) {
    console.error('[setup] Workspace directory already exists');
    return;
  }

  console.error('[setup] Creating workspace/ directory...');
  mkdirSync(workspacePath, { recursive: true });
  console.error(`[setup] Created ${workspacePath}`);
}

function printNextSteps(): void {
  console.error('');
  console.error('✅ Setup complete!');
  console.error('');
  printSecurityReminder();
  console.error('');
  console.error('Next steps:');
  console.error('');
  console.error('  1. Try the agent with a prompt:');
  console.error('     npm run agent -- "summarize file MEMORY.md"');
  console.error('');
  console.error('  2. Start the dashboard (includes chat):');
  console.error('     npm run dashboard');
  console.error('     Then open http://127.0.0.1:3847');
  console.error('');
  console.error('  3. Optional: Configure Telegram bot');
  console.error('     npm run onboard');
  console.error('     (or set TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHAT_IDS)');
  console.error('');
  console.error('  4. Optional: Install weekday health check tick');
  console.error('     npm run cron:install');
  console.error('     (runs --check-only; notifies Telegram only when needed)');
  console.error('');
  console.error('Learn more: README.md and TUTORIAL.md');
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
