import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface CostEntry {
  readonly timestamp: number;
  readonly channel: 'cli' | 'dashboard' | 'telegram' | 'cron';
  readonly model: string;
  readonly durationMs: number;
  readonly clientId?: string;
}

export interface BudgetConfig {
  readonly dailyLimitMs: number;
  readonly hourlyLimitMs: number;
  readonly perSessionLimitMs: number;
}

export interface UsageStats {
  readonly hourlyUsageMs: number;
  readonly dailyUsageMs: number;
  readonly sessionUsageMs: number;
  readonly remainingHourlyMs: number;
  readonly remainingDailyMs: number;
  readonly remainingSessionMs: number;
}

const COST_LOG_RELATIVE_PATH = 'logs/cost-tracker.ndjson';

const DEFAULT_BUDGET: BudgetConfig = {
  dailyLimitMs: 3_600_000,
  hourlyLimitMs: 600_000,
  perSessionLimitMs: 300_000,
};

export function resolveBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  const dailyLimit = parsePositiveInt(env['CURSOR_AGENT_DAILY_LIMIT_MS']);
  const hourlyLimit = parsePositiveInt(env['CURSOR_AGENT_HOURLY_LIMIT_MS']);
  const sessionLimit = parsePositiveInt(env['CURSOR_AGENT_SESSION_LIMIT_MS']);

  return {
    dailyLimitMs: dailyLimit ?? DEFAULT_BUDGET.dailyLimitMs,
    hourlyLimitMs: hourlyLimit ?? DEFAULT_BUDGET.hourlyLimitMs,
    perSessionLimitMs: sessionLimit ?? DEFAULT_BUDGET.perSessionLimitMs,
  };
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function recordCost(
  repoRoot: string,
  entry: CostEntry,
): Promise<void> {
  const logPath = path.join(repoRoot, COST_LOG_RELATIVE_PATH);
  await mkdir(path.dirname(logPath), { recursive: true });
  
  const line = JSON.stringify(entry) + '\n';
  try {
    const existing = existsSync(logPath) ? await readFile(logPath, 'utf8') : '';
    await writeFile(logPath, existing + line, 'utf8');
  } catch (error: unknown) {
    console.error(`[cost-tracker] Failed to record cost: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getUsageStats(
  repoRoot: string,
  budget: BudgetConfig,
  clientId?: string,
): Promise<UsageStats> {
  const logPath = path.join(repoRoot, COST_LOG_RELATIVE_PATH);
  
  if (!existsSync(logPath)) {
    return {
      hourlyUsageMs: 0,
      dailyUsageMs: 0,
      sessionUsageMs: 0,
      remainingHourlyMs: budget.hourlyLimitMs,
      remainingDailyMs: budget.dailyLimitMs,
      remainingSessionMs: budget.perSessionLimitMs,
    };
  }

  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const oneDayAgo = now - 86_400_000;

  let hourlyUsageMs = 0;
  let dailyUsageMs = 0;
  let sessionUsageMs = 0;

  try {
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n').filter((line) => line.trim() !== '');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CostEntry;
        
        if (entry.timestamp >= oneHourAgo) {
          hourlyUsageMs += entry.durationMs;
        }
        
        if (entry.timestamp >= oneDayAgo) {
          dailyUsageMs += entry.durationMs;
        }
        
        if (clientId !== undefined && entry.clientId === clientId && entry.timestamp >= oneHourAgo) {
          sessionUsageMs += entry.durationMs;
        }
      } catch {
        continue;
      }
    }
  } catch (error: unknown) {
    console.error(`[cost-tracker] Failed to read usage stats: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    hourlyUsageMs,
    dailyUsageMs,
    sessionUsageMs,
    remainingHourlyMs: Math.max(0, budget.hourlyLimitMs - hourlyUsageMs),
    remainingDailyMs: Math.max(0, budget.dailyLimitMs - dailyUsageMs),
    remainingSessionMs: Math.max(0, budget.perSessionLimitMs - sessionUsageMs),
  };
}

export function checkBudgetExceeded(stats: UsageStats): { exceeded: boolean; reason?: string } {
  if (stats.remainingHourlyMs <= 0) {
    return { exceeded: true, reason: 'hourly limit exceeded' };
  }
  if (stats.remainingDailyMs <= 0) {
    return { exceeded: true, reason: 'daily limit exceeded' };
  }
  if (stats.remainingSessionMs <= 0) {
    return { exceeded: true, reason: 'session limit exceeded' };
  }
  return { exceeded: false };
}
