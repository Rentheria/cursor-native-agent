import { createTelegramApi } from '../channels/telegram-api.js';
import type { CronTickReport } from './cron-tick.js';
import { deriveCronVerdict } from './cron-tick.js';

export const TELEGRAM_BOT_TOKEN_ENV = 'TELEGRAM_BOT_TOKEN';
export const TELEGRAM_ALLOWED_CHAT_IDS_ENV = 'TELEGRAM_ALLOWED_CHAT_IDS';

export interface TelegramNotifyOptions {
  readonly token: string;
  readonly allowedChatIds: readonly number[];
}

export function shouldNotifyCronResult(report: CronTickReport): boolean {
  const verdict = deriveCronVerdict(report.snapshot);
  if (verdict.startsWith('READY')) {
    return false;
  }
  return true;
}

export function formatCronNotification(report: CronTickReport): string {
  const verdict = deriveCronVerdict(report.snapshot);
  const { snapshot, delta, triage } = report;
  
  const lines = [
    `🔔 *cursor-native-agent cron tick*`,
    ``,
    `*Verdict:* ${verdict}`,
    `*Branch:* ${snapshot.branch}`,
    `*Commit:* \`${snapshot.head.slice(0, 7)}\``,
    `*Issues:* ${String(snapshot.issues.length)}`,
  ];

  if (delta.newIssues.length > 0) {
    lines.push(`*New:* ${String(delta.newIssues.length)}`);
  }
  if (delta.resolvedIssues.length > 0) {
    lines.push(`*Resolved:* ${String(delta.resolvedIssues.length)}`);
  }

  if (triage.finding !== undefined && triage.finding !== '') {
    lines.push(``, `*Finding:* ${triage.finding}`);
  }
  if (triage.action !== undefined && triage.action !== '') {
    lines.push(`*Action:* ${triage.action}`);
  }

  if (snapshot.issues.length > 0 && snapshot.issues.length <= 5) {
    lines.push(``);
    for (const issue of snapshot.issues) {
      lines.push(`• [${issue.severity}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

export function parseTelegramChatIds(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const ids: number[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    if (token === '') {
      continue;
    }
    const id = Number(token);
    if (!Number.isSafeInteger(id)) {
      throw new Error(
        `${TELEGRAM_ALLOWED_CHAT_IDS_ENV} contains "${token}", which is not a valid Telegram numeric ID.`,
      );
    }
    ids.push(id);
  }
  return ids;
}

export function getTelegramNotifyConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramNotifyOptions | undefined {
  const token = env[TELEGRAM_BOT_TOKEN_ENV];
  if (token === undefined || token.trim() === '') {
    return undefined;
  }

  const chatIdsRaw = env[TELEGRAM_ALLOWED_CHAT_IDS_ENV];
  const chatIds = parseTelegramChatIds(chatIdsRaw);
  if (chatIds.length === 0) {
    return undefined;
  }

  return {
    token: token.trim(),
    allowedChatIds: chatIds,
  };
}

export async function notifyTelegramCronResult(
  report: CronTickReport,
  options: TelegramNotifyOptions,
): Promise<void> {
  if (!shouldNotifyCronResult(report)) {
    return;
  }

  const api = createTelegramApi({ token: options.token });
  const message = formatCronNotification(report);

  const errors: Error[] = [];
  for (const chatId of options.allowedChatIds) {
    try {
      await api.sendMessage({ chatId, text: message });
    } catch (error: unknown) {
      errors.push(
        error instanceof Error
          ? error
          : new Error(`Failed to send to chat ${String(chatId)}: ${String(error)}`),
      );
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Failed to send Telegram notification to ${String(errors.length)} chat(s)`,
    );
  }
}

export async function maybeNotifyTelegramCronResult(
  report: CronTickReport,
): Promise<void> {
  const config = getTelegramNotifyConfig();
  if (config === undefined) {
    console.error('[cron] Telegram not configured; skipping notification');
    return;
  }

  if (!shouldNotifyCronResult(report)) {
    console.error('[cron] Verdict is READY; no Telegram notification needed');
    return;
  }

  console.error(
    `[cron] Sending Telegram notification to ${String(config.allowedChatIds.length)} chat(s)…`,
  );
  try {
    await notifyTelegramCronResult(report, config);
    console.error('[cron] Telegram notification sent successfully');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] Telegram notification failed: ${message}`);
  }
}
