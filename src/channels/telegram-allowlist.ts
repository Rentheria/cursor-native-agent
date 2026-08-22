/**
 * Inbound Telegram messages are executed by `cursor-agent --force`, so an open
 * bot is remote code execution on the host running it. The allowlist is
 * mandatory and fails closed: no configuration means the bot refuses to start.
 */

import type { InboundTelegramText } from './telegram-parse.js';

export const TELEGRAM_ALLOWED_CHAT_IDS_ENV = 'TELEGRAM_ALLOWED_CHAT_IDS';
export const TELEGRAM_ALLOWED_USER_IDS_ENV = 'TELEGRAM_ALLOWED_USER_IDS';

export interface TelegramAllowlist {
  readonly chatIds: ReadonlySet<number>;
  /** Optional extra narrowing: when non-empty, the sender must be listed too. */
  readonly userIds: ReadonlySet<number>;
  /** Repo root path for per-chat workspace resolution. */
  readonly repoRoot?: string | undefined;
}

/**
 * Reads the allowlist from the given env map. Throws with setup instructions
 * when no chat is allowed — never defaults to "allow everyone".
 */
export function requireTelegramAllowlist(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot?: string,
): TelegramAllowlist {
  const chatIds = parseIdList(env[TELEGRAM_ALLOWED_CHAT_IDS_ENV], TELEGRAM_ALLOWED_CHAT_IDS_ENV);
  const userIds = parseIdList(env[TELEGRAM_ALLOWED_USER_IDS_ENV], TELEGRAM_ALLOWED_USER_IDS_ENV);

  if (chatIds.size === 0) {
    throw new Error(
      [
        `${TELEGRAM_ALLOWED_CHAT_IDS_ENV} is not set.`,
        'This bot runs every inbound message through cursor-agent, so it must',
        'never listen to strangers. List the chat IDs allowed to talk to it:',
        '',
        `  export ${TELEGRAM_ALLOWED_CHAT_IDS_ENV}="123456789,-1009876543210"`,
        `  export ${TELEGRAM_ALLOWED_USER_IDS_ENV}="123456789"   # optional, narrows by sender`,
        '  npm run telegram',
        '',
        'To discover your chat ID: start the bot with a placeholder (e.g. 0),',
        'send it a message, and read the ID off the "[telegram] Ignored',
        'message from …" line it logs.',
      ].join('\n'),
    );
  }

  return { chatIds, userIds, repoRoot };
}

export function isInboundAllowed(
  inbound: InboundTelegramText,
  allowlist: TelegramAllowlist,
): boolean {
  if (!allowlist.chatIds.has(inbound.chatId)) {
    return false;
  }
  if (allowlist.userIds.size === 0) {
    return true;
  }
  return (
    inbound.fromUserId !== undefined && allowlist.userIds.has(inbound.fromUserId)
  );
}

/** Identifies a rejected sender in logs so an operator can allow it on purpose. */
export function describeInboundSender(inbound: InboundTelegramText): string {
  const user =
    inbound.fromUserId === undefined ? 'unknown' : String(inbound.fromUserId);
  const handle = inbound.fromUsername === undefined ? '' : ` @${inbound.fromUsername}`;
  return `chat=${String(inbound.chatId)} user=${user}${handle}`;
}

export function describeAllowlist(allowlist: TelegramAllowlist): string {
  const chats = `${String(allowlist.chatIds.size)} chat(s)`;
  return allowlist.userIds.size === 0
    ? chats
    : `${chats}, narrowed to ${String(allowlist.userIds.size)} user(s)`;
}

/** A malformed entry is a configuration bug, not a reason to allow less/more. */
function parseIdList(raw: string | undefined, envName: string): ReadonlySet<number> {
  const ids = new Set<number>();
  if (raw === undefined) {
    return ids;
  }

  for (const token of raw.split(/[\s,]+/)) {
    if (token === '') {
      continue;
    }
    const id = Number(token);
    if (!Number.isSafeInteger(id)) {
      throw new Error(
        `${envName} contains "${token}", which is not a Telegram numeric ID.`,
      );
    }
    ids.add(id);
  }
  return ids;
}
