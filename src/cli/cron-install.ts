import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const CRON_INSTALL_SCHEDULE_ENV = 'CURSOR_NATIVE_AGENT_CRON_SCHEDULE';
export const DEFAULT_CRON_SCHEDULE = '0 9 * * 1-5';

export interface CronInstallOptions {
  readonly repoRoot: string;
  readonly schedule?: string | undefined;
  readonly checkOnly?: boolean | undefined;
}

export interface CronInstallResult {
  readonly success: boolean;
  readonly message: string;
  readonly cronLine?: string;
}

export function buildCronLine(options: CronInstallOptions): string {
  const schedule = options.schedule ?? DEFAULT_CRON_SCHEDULE;
  const scriptPath = path.join(options.repoRoot, 'scripts', 'cron-tick.sh');
  const checkOnlyFlag = options.checkOnly !== false ? ' --check-only' : '';
  return `${schedule} ${scriptPath}${checkOnlyFlag} >> ${path.join(options.repoRoot, 'logs', 'cron.stdout.log')} 2>&1`;
}

export async function installCrontab(options: CronInstallOptions): Promise<CronInstallResult> {
  try {
    await execAsync('which crontab');
  } catch {
    return {
      success: false,
      message: [
        'crontab command not found.',
        '',
        'This system does not have cron installed. Install cron/cronie first:',
        '',
        '  Ubuntu/Debian: sudo apt install cron',
        '  Fedora/RHEL:   sudo dnf install cronie',
        '  macOS:         cron is pre-installed',
        '',
        'Then retry: npm run cron:install',
      ].join('\n'),
    };
  }

  const cronLine = buildCronLine(options);
  const marker = `# cursor-native-agent ${options.repoRoot}`;

  let currentCrontab = '';
  try {
    const result = await execAsync('crontab -l');
    currentCrontab = result.stdout;
  } catch (error: unknown) {
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : '';
    if (!stderr.includes('no crontab')) {
      throw error;
    }
  }

  if (currentCrontab.includes(marker)) {
    return {
      success: false,
      message: `Cron job already installed for ${options.repoRoot}. Run 'npm run cron:uninstall' first if you want to reinstall.`,
      cronLine,
    };
  }

  const newCrontab = currentCrontab.trimEnd() + (currentCrontab === '' ? '' : '\n') +
    `\n${marker}\n${cronLine}\n`;

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('crontab', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.stdin.write(newCrontab);
      proc.stdin.end();
      
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`crontab exited with code ${code}: ${stderr}`));
        }
      });
      
      proc.on('error', reject);
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to install crontab: ${message}`,
    };
  }

  return {
    success: true,
    message: `Cron job installed successfully.\n\nSchedule: ${options.schedule ?? DEFAULT_CRON_SCHEDULE}\nScript: ${path.join(options.repoRoot, 'scripts', 'cron-tick.sh')}${options.checkOnly ? ' --check-only' : ''}\n\nTo verify: crontab -l`,
    cronLine,
  };
}

export async function uninstallCrontab(repoRoot: string): Promise<CronInstallResult> {
  try {
    await execAsync('which crontab');
  } catch {
    return {
      success: false,
      message: 'crontab command not found. Nothing to uninstall.',
    };
  }

  const marker = `# cursor-native-agent ${repoRoot}`;

  let currentCrontab = '';
  try {
    const result = await execAsync('crontab -l');
    currentCrontab = result.stdout;
  } catch (error: unknown) {
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : '';
    if (stderr.includes('no crontab')) {
      return {
        success: false,
        message: 'No crontab found. Nothing to uninstall.',
      };
    }
    throw error;
  }

  if (!currentCrontab.includes(marker)) {
    return {
      success: false,
      message: `No cron job found for ${repoRoot}. Nothing to uninstall.`,
    };
  }

  const lines = currentCrontab.split('\n');
  const filtered: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    if (line === marker) {
      skipNext = true;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    filtered.push(line);
  }

  const newCrontab = filtered.join('\n').trim();

  if (newCrontab === '') {
    try {
      await execAsync('crontab -r');
    } catch {
      // crontab -r fails if crontab is already empty; ignore
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('crontab', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.stdin.write(newCrontab + '\n');
      proc.stdin.end();
      
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`crontab exited with code ${code}: ${stderr}`));
        }
      });
      
      proc.on('error', reject);
    });
  }

  return {
    success: true,
    message: `Cron job uninstalled successfully for ${repoRoot}.`,
  };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );

  const args = process.argv.slice(2);
  const isUninstall = args.includes('--uninstall');
  const scheduleFromEnv = process.env[CRON_INSTALL_SCHEDULE_ENV];
  const schedule = scheduleFromEnv !== undefined && scheduleFromEnv.trim() !== ''
    ? scheduleFromEnv.trim()
    : undefined;
  const checkOnly = !args.includes('--no-check-only');

  if (isUninstall) {
    const result = await uninstallCrontab(repoRoot);
    console.log(result.message);
    process.exitCode = result.success ? 0 : 1;
    return;
  }

  const result = await installCrontab({
    repoRoot,
    schedule,
    checkOnly,
  });
  console.log(result.message);
  process.exitCode = result.success ? 0 : 1;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}
