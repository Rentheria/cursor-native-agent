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
  readonly taskName?: string;
}

export function getPlatform(): NodeJS.Platform {
  return process.platform;
}

function parseScheduleForWindows(cronSchedule: string): { time: string; days: string } | null {
  const parts = cronSchedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }
  const [minute, hour, , , dayOfWeek] = parts;
  
  if (minute === undefined || hour === undefined || dayOfWeek === undefined) {
    return null;
  }
  
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  
  const daysMap: Record<string, string> = {
    '1-5': 'MON,TUE,WED,THU,FRI',
    '*': 'MON,TUE,WED,THU,FRI,SAT,SUN',
  };
  
  const days = daysMap[dayOfWeek] ?? 'MON,TUE,WED,THU,FRI';
  
  return { time, days };
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

function buildTaskName(repoRoot: string): string {
  const safeName = path.basename(repoRoot).replace(/[^a-zA-Z0-9-]/g, '-');
  return `CursorNativeAgent-${safeName}`;
}

export async function installTaskScheduler(options: CronInstallOptions): Promise<CronInstallResult> {
  try {
    await execAsync('where schtasks');
  } catch {
    return {
      success: false,
      message: [
        'schtasks command not found.',
        '',
        'Task Scheduler is not available. This should be pre-installed on Windows.',
        '',
        'Alternative: Use WSL (Windows Subsystem for Linux) and install cron there:',
        '  wsl --install',
        '  Then inside WSL: sudo apt install cron',
        '',
        'Then retry: npm run cron:install',
      ].join('\n'),
    };
  }

  const taskName = buildTaskName(options.repoRoot);
  const schedule = options.schedule ?? DEFAULT_CRON_SCHEDULE;
  const parsed = parseScheduleForWindows(schedule);

  if (parsed === null) {
    return {
      success: false,
      message: [
        `Invalid schedule format: ${schedule}`,
        '',
        'Expected cron format (e.g., "0 9 * * 1-5" for weekdays at 9:00 AM).',
        'Currently only supports basic schedules with hour, minute, and day-of-week.',
      ].join('\n'),
    };
  }

  try {
    const result = await execAsync(`schtasks /Query /TN "${taskName}"`, { encoding: 'utf8' });
    if (result.stdout.includes(taskName)) {
      return {
        success: false,
        message: `Task "${taskName}" already exists. Run 'npm run cron:uninstall' first if you want to reinstall.`,
        taskName,
      };
    }
  } catch {
    // Task doesn't exist, continue with creation
  }

  const npmPath = process.execPath.replace(/node(\.exe)?$/i, 'npm');
  const checkOnlyFlag = options.checkOnly !== false ? ' --check-only' : '';
  const command = `"${npmPath}" run cron --prefix "${options.repoRoot}" --${checkOnlyFlag}`;

  const schtasksArgs = [
    '/Create',
    '/TN', taskName,
    '/TR', command,
    '/SC', 'WEEKLY',
    '/D', parsed.days,
    '/ST', parsed.time,
    '/F',
  ];

  try {
    await execAsync(`schtasks ${schtasksArgs.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`, { encoding: 'utf8' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: [
        'Failed to create scheduled task.',
        '',
        `Error: ${message}`,
        '',
        'Make sure you have permission to create scheduled tasks.',
        'You may need to run the command prompt as Administrator.',
      ].join('\n'),
    };
  }

  return {
    success: true,
    message: [
      `Task "${taskName}" created successfully.`,
      '',
      `Schedule: ${parsed.days} at ${parsed.time}`,
      `Command: npm run cron${checkOnlyFlag}`,
      '',
      `To verify: schtasks /Query /TN "${taskName}"`,
    ].join('\n'),
    taskName,
  };
}

export async function uninstallTaskScheduler(repoRoot: string): Promise<CronInstallResult> {
  try {
    await execAsync('where schtasks');
  } catch {
    return {
      success: false,
      message: 'schtasks command not found. Nothing to uninstall.',
    };
  }

  const taskName = buildTaskName(repoRoot);

  try {
    const result = await execAsync(`schtasks /Query /TN "${taskName}"`, { encoding: 'utf8' });
    if (!result.stdout.includes(taskName)) {
      return {
        success: false,
        message: `Task "${taskName}" not found. Nothing to uninstall.`,
        taskName,
      };
    }
  } catch {
    return {
      success: false,
      message: `Task "${taskName}" not found. Nothing to uninstall.`,
      taskName,
    };
  }

  try {
    await execAsync(`schtasks /Delete /TN "${taskName}" /F`, { encoding: 'utf8' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: [
        `Failed to delete task "${taskName}".`,
        '',
        `Error: ${message}`,
        '',
        'Make sure you have permission to delete scheduled tasks.',
        'You may need to run the command prompt as Administrator.',
      ].join('\n'),
      taskName,
    };
  }

  return {
    success: true,
    message: `Task "${taskName}" deleted successfully.`,
    taskName,
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

  const platform = getPlatform();
  const isWindows = platform === 'win32';

  if (isUninstall) {
    const result = isWindows
      ? await uninstallTaskScheduler(repoRoot)
      : await uninstallCrontab(repoRoot);
    console.log(result.message);
    process.exitCode = result.success ? 0 : 1;
    return;
  }

  const result = isWindows
    ? await installTaskScheduler({
        repoRoot,
        schedule,
        checkOnly,
      })
    : await installCrontab({
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
