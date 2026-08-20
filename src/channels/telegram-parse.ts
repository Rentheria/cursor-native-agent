import type { TelegramUpdate } from './telegram-api.js';

/** Inbound text message extracted from a Bot API update. */
export interface InboundTelegramText {
  readonly updateId: number;
  readonly messageId: number;
  readonly chatId: number;
  readonly text: string;
  /** Numeric sender ID — the only stable identity for allowlisting. */
  readonly fromUserId: number | undefined;
  readonly fromUsername: string | undefined;
}

/**
 * Keeps only updates that carry a non-empty text message (ignores stickers,
 * photos, edits, callbacks, etc.).
 */
export function extractInboundTextMessages(
  updates: readonly TelegramUpdate[],
): InboundTelegramText[] {
  const inbound: InboundTelegramText[] = [];
  for (const update of updates) {
    const message = update.message;
    if (message === undefined) {
      continue;
    }
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (text === '') {
      continue;
    }
    inbound.push({
      updateId: update.update_id,
      messageId: message.message_id,
      chatId: message.chat.id,
      text,
      fromUserId: message.from?.id,
      fromUsername: message.from?.username,
    });
  }
  return inbound;
}

/**
 * Next getUpdates offset after consuming a batch (max update_id + 1).
 * Returns the previous offset when the batch is empty.
 */
export function nextUpdateOffset(
  updates: readonly TelegramUpdate[],
  previousOffset: number,
): number {
  if (updates.length === 0) {
    return previousOffset;
  }
  let maxId = previousOffset - 1;
  for (const update of updates) {
    if (update.update_id > maxId) {
      maxId = update.update_id;
    }
  }
  return maxId + 1;
}
