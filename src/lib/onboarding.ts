import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output, env as processEnv } from 'node:process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';

export interface OnboardingConfig {
  readonly CURSOR_AGENT_MODEL: string;
  readonly PORT: string;
  readonly CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: string;
  readonly CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY: string;
  readonly CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K: string;
  readonly CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD: string;
  readonly CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER: string;
  readonly WORKSPACE_PATH: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_ALLOWED_CHAT_IDS: string;
  readonly CURSOR_NATIVE_AGENT_DEBUG: string;
  readonly CURSOR_NATIVE_AGENT_ONBOARDED: string;
  readonly DASHBOARD_TOKEN: string;
}

export interface OnboardingOptions {
  readonly repoRoot: string;
  readonly skipOnboarding?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

const ONBOARDED_MARKER = 'CURSOR_NATIVE_AGENT_ONBOARDED';
const SKIP_ONBOARD_ENV = 'CURSOR_NATIVE_AGENT_SKIP_ONBOARD';

/**
 * Detects the user's Documents folder, checking for Spanish "Documentos" first.
 * @deprecated No longer used for default workspace path. Use repo workspace/ instead.
 */
export function detectDocumentsFolder(): string {
  const home = homedir();
  const documentosPath = path.join(home, 'Documentos');
  const documentsPath = path.join(home, 'Documents');

  if (existsSync(documentosPath)) {
    return documentosPath;
  }
  if (existsSync(documentsPath)) {
    return documentsPath;
  }
  const fallback = documentsPath;
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

/**
 * Returns the default workspace path: empty string (defaults to <repo>/workspace).
 */
export function getDefaultWorkspacePath(): string {
  return '';
}

/**
 * Checks if onboarding should be skipped.
 * Returns true if:
 * - skipOnboarding option is true
 * - CURSOR_NATIVE_AGENT_SKIP_ONBOARD=1
 * - CI environment detected
 * - --yes flag passed
 * - .env already exists with onboarding marker
 * - Not a TTY (unless skipOnboarding is explicitly false, for tests)
 */
export function shouldSkipOnboarding(options: OnboardingOptions): boolean {
  const env = options.env ?? processEnv;
  const envPath = path.join(options.repoRoot, '.env');

  if (options.skipOnboarding === true) {
    return true;
  }

  if (env[SKIP_ONBOARD_ENV] === '1') {
    return true;
  }

  if (env['CI'] === 'true' || env['CI'] === '1') {
    return true;
  }

  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    return true;
  }

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    if (content.includes(`${ONBOARDED_MARKER}=1`)) {
      return true;
    }
  }

  if (options.skipOnboarding === false) {
    return false;
  }

  if (!input.isTTY) {
    return true;
  }

  return false;
}

/**
 * Prompts the user to choose Auto or Personalizado for a setting.
 * Returns the auto value if they choose auto (press Enter), or prompts for custom value.
 */
async function promptAutoOrCustom(
  rl: ReturnType<typeof createInterface>,
  settingName: string,
  autoValue: string,
  customPrompt: string,
  validator?: (value: string) => boolean,
): Promise<string> {
  const choice = await rl.question(
    `${settingName} [auto/personalizado] (Enter = auto → ${autoValue}): `,
  );
  const trimmed = choice.trim().toLowerCase();

  if (trimmed === '' || trimmed === 'auto' || trimmed === 'a') {
    return autoValue;
  }

  if (trimmed === 'personalizado' || trimmed === 'p') {
    let customValue: string;
    let valid = false;
    while (!valid) {
      customValue = await rl.question(`  ${customPrompt}: `);
      customValue = customValue.trim();
      if (!validator || validator(customValue)) {
        return customValue;
      }
      console.error('  Valor inválido. Intenta de nuevo.');
    }
  }

  return autoValue;
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
 * Validates a port number is in range 1024-65535.
 */
function isValidPort(port: string): boolean {
  const num = Number.parseInt(port, 10);
  return Number.isFinite(num) && num >= 1024 && num <= 65535;
}

/**
 * Runs the interactive onboarding flow and returns the configuration.
 */
export async function runInteractiveOnboarding(): Promise<OnboardingConfig> {
  const rl = createInterface({ input, output });
  console.error('');
  console.error('=== Bienvenido a cursor-native-agent ===');
  console.error('Configuración inicial. Presiona Enter para Auto o elige Personalizado.');
  console.error('');

  try {
    const model = await promptAutoOrCustom(
      rl,
      'Modelo',
      'composer-2.5-fast',
      'Ingresa el ID del modelo (ej. composer-2.5-fast)',
    );

    const port = await promptAutoOrCustom(
      rl,
      'Puerto',
      '3847',
      'Puerto del dashboard (1024-65535)',
      isValidPort,
    );

    const chat = await promptAutoOrCustom(
      rl,
      'Chat en dashboard',
      '1',
      'Habilitar? (1=sí, 0=no)',
      (value) => value === '0' || value === '1',
    );

    const workspaceDefault = getDefaultWorkspacePath();
    let workspacePath = await promptAutoOrCustom(
      rl,
      'Workspace',
      workspaceDefault,
      'Ruta para proyectos de usuario (absolute or relative to repo; empty = <repo>/workspace)',
    );
    if (workspacePath.trim() !== '') {
      workspacePath = expandPath(workspacePath);
    }

    console.error('');
    console.error('Telegram es opcional (Auto = omitir).');
    const telegramChoice = await rl.question(
      'Configurar Telegram? [auto/personalizado] (Enter = auto → omitir): ',
    );
    const trimmedChoice = telegramChoice.trim().toLowerCase();

    let telegramToken = '';
    let telegramChatIds = '';
    if (trimmedChoice === 'personalizado' || trimmedChoice === 'p') {
      telegramToken = await rl.question('  Token del bot de Telegram: ');
      telegramToken = telegramToken.trim();
      telegramChatIds = await rl.question('  Chat IDs permitidos (separados por comas): ');
      telegramChatIds = telegramChatIds.trim();
    }

    console.error('');
    console.error('Configuración completada. Guardando en .env...');

    return {
      CURSOR_AGENT_MODEL: model,
      PORT: port,
      CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: chat,
      CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY: '1',
      CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K: '3',
      CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD: '0.12',
      CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER: 'local',
      WORKSPACE_PATH: workspacePath,
      TELEGRAM_BOT_TOKEN: telegramToken,
      TELEGRAM_ALLOWED_CHAT_IDS: telegramChatIds,
      CURSOR_NATIVE_AGENT_DEBUG: '0',
      CURSOR_NATIVE_AGENT_ONBOARDED: '1',
      DASHBOARD_TOKEN: generateDashboardToken(),
    };
  } finally {
    rl.close();
  }
}

/**
 * Generates a cryptographically random token for dashboard authentication.
 */
export function generateDashboardToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Returns the default configuration without prompting (for non-interactive environments).
 */
export function getDefaultConfig(): OnboardingConfig {
  return {
    CURSOR_AGENT_MODEL: 'composer-2.5-fast',
    PORT: '3847',
    CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: '1',
    CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY: '1',
    CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K: '3',
    CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD: '0.12',
    CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER: 'local',
    WORKSPACE_PATH: getDefaultWorkspacePath(),
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_ALLOWED_CHAT_IDS: '',
    CURSOR_NATIVE_AGENT_DEBUG: '0',
    CURSOR_NATIVE_AGENT_ONBOARDED: '1',
    DASHBOARD_TOKEN: generateDashboardToken(),
  };
}

/**
 * Writes the configuration to .env file.
 */
export function writeEnvFile(repoRoot: string, config: OnboardingConfig): void {
  const envPath = path.join(repoRoot, '.env');
  const lines: string[] = [
    '# cursor-native-agent configuration',
    '# Generated by first-run onboarding',
    '',
    `CURSOR_AGENT_MODEL=${config.CURSOR_AGENT_MODEL}`,
    `PORT=${config.PORT}`,
    `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=${config.CURSOR_NATIVE_AGENT_DASHBOARD_CHAT}`,
    `CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY=${config.CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY}`,
    `CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K=${config.CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K}`,
    `CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD=${config.CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD}`,
    `CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER=${config.CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER}`,
    `WORKSPACE_PATH=${config.WORKSPACE_PATH}`,
  ];

  if (config.TELEGRAM_BOT_TOKEN !== '') {
    lines.push(`TELEGRAM_BOT_TOKEN=${config.TELEGRAM_BOT_TOKEN}`);
  }
  if (config.TELEGRAM_ALLOWED_CHAT_IDS !== '') {
    lines.push(`TELEGRAM_ALLOWED_CHAT_IDS=${config.TELEGRAM_ALLOWED_CHAT_IDS}`);
  }

  lines.push(`DASHBOARD_TOKEN=${config.DASHBOARD_TOKEN}`);
  lines.push(`CURSOR_NATIVE_AGENT_DEBUG=${config.CURSOR_NATIVE_AGENT_DEBUG}`);
  lines.push(`${ONBOARDED_MARKER}=${config.CURSOR_NATIVE_AGENT_ONBOARDED}`);
  lines.push('');

  writeFileSync(envPath, lines.join('\n'), 'utf8');
}

/**
 * Ensures the workspace directory exists.
 */
export function ensureWorkspaceExists(workspacePath: string): void {
  mkdirSync(workspacePath, { recursive: true });
}

/**
 * Ensures .env exists with default config, never prompting.
 * Used for one-shot agent runs that should not block on interactive onboarding.
 * Returns true if .env was written, false if it already existed.
 * If DASHBOARD_TOKEN is missing, generates and writes one.
 */
export function ensureDefaultConfig(repoRoot: string): boolean {
  const envPath = path.join(repoRoot, '.env');
  
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    if (content.includes(`${ONBOARDED_MARKER}=1`)) {
      const hasDashboardToken = /^DASHBOARD_TOKEN=.+$/m.test(content);
      if (!hasDashboardToken) {
        const newToken = generateDashboardToken();
        const updatedContent = content.trimEnd() + `\nDASHBOARD_TOKEN=${newToken}\n`;
        writeFileSync(envPath, updatedContent, 'utf8');
        console.error('[onboarding] Generated DASHBOARD_TOKEN and added to .env');
        console.error(`[onboarding] Dashboard token: ${newToken}`);
        return true;
      }
      return false;
    }
  }

  const config = getDefaultConfig();
  writeEnvFile(repoRoot, config);
  
  if (config.WORKSPACE_PATH !== '') {
    ensureWorkspaceExists(config.WORKSPACE_PATH);
  }
  
  console.error('[onboarding] Created default configuration in .env');
  console.error(`[onboarding] Dashboard token: ${config.DASHBOARD_TOKEN}`);
  return true;
}

/**
 * Main onboarding entry point. Call this from product entrypoints.
 * Returns true if onboarding ran (or was needed but skipped), false otherwise.
 */
export async function maybeRunOnboarding(
  options: OnboardingOptions,
): Promise<boolean> {
  if (shouldSkipOnboarding(options)) {
    return false;
  }

  let config: OnboardingConfig;
  if (!input.isTTY) {
    config = getDefaultConfig();
    console.error('[onboarding] Non-interactive mode: using defaults');
  } else {
    config = await runInteractiveOnboarding();
  }

  writeEnvFile(options.repoRoot, config);
  if (config.WORKSPACE_PATH !== '') {
    ensureWorkspaceExists(config.WORKSPACE_PATH);
  }

  console.error(`[onboarding] Configuration saved to .env`);
  if (config.WORKSPACE_PATH !== '') {
    console.error(`[onboarding] Workspace: ${config.WORKSPACE_PATH}`);
  } else {
    console.error(`[onboarding] Workspace: <repo>/workspace (default)`);
  }
  console.error('');

  return true;
}
