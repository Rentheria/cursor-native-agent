/**
 * Live-updating Telegram reply: sends one message as soon as the model starts
 * answering and edits it while deltas arrive, so a 9-16 s turn shows progress
 * instead of silence.
 *
 * Telegram rate-limits edits per chat, so deltas are grouped into buffers
 * instead of producing one edit per delta.
 */

import {
  chunkTelegramText,
  TELEGRAM_MAX_MESSAGE_LENGTH,
  type TelegramMessage,
} from './telegram-api.js';

/** Flush at most this often, even while deltas keep arriving. */
export const LIVE_REPLY_FLUSH_INTERVAL_MS = 1500;
/** …or as soon as this many unrendered characters have piled up. */
export const LIVE_REPLY_FLUSH_CHARS = 200;

/** Only the Telegram methods a live reply consumes. */
export interface LiveReplyApi {
  sendMessage(params: {
    readonly chatId: number;
    readonly text: string;
  }): Promise<TelegramMessage>;
  editMessageText(params: {
    readonly chatId: number;
    readonly messageId: number;
    readonly text: string;
  }): Promise<TelegramMessage>;
}

export interface TelegramLiveReplyOptions {
  readonly api: LiveReplyApi;
  readonly chatId: number;
  /** Injected in tests; defaults to the wall clock. */
  readonly now?: () => number;
}

export interface TelegramLiveReply {
  /** Buffers one assistant delta, flushing to Telegram when it is due. */
  readonly pushDelta: (text: string) => void;
  /** Replaces the live message with the final text (chunked when too long). */
  readonly finish: (finalText: string) => Promise<void>;
}

export function createTelegramLiveReply(
  options: TelegramLiveReplyOptions,
): TelegramLiveReply {
  const now = options.now ?? Date.now;
  const { api, chatId } = options;

  let streamed = '';
  let renderedText = '';
  let liveMessageId: number | undefined;
  let lastFlushAt = now();
  let inFlight: Promise<void> | undefined;

  const isFlushDue = (): boolean => {
    // Past the message limit the live view cannot grow; `finish` chunks it.
    if (streamed.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      return false;
    }
    const unrenderedChars = streamed.length - renderedText.length;
    if (unrenderedChars <= 0) {
      return false;
    }
    return (
      unrenderedChars >= LIVE_REPLY_FLUSH_CHARS ||
      now() - lastFlushAt >= LIVE_REPLY_FLUSH_INTERVAL_MS
    );
  };

  const renderLive = async (text: string): Promise<void> => {
    if (liveMessageId === undefined) {
      const sent = await api.sendMessage({ chatId, text });
      liveMessageId = sent.message_id;
    } else {
      await api.editMessageText({ chatId, messageId: liveMessageId, text });
    }
    renderedText = text;
  };

  const scheduleFlush = (): void => {
    if (inFlight !== undefined) {
      return;
    }
    lastFlushAt = now();
    inFlight = renderLive(streamed)
      .catch(reportLiveReplyError)
      .finally(() => {
        inFlight = undefined;
      });
  };

  const settleLiveMessage = async (text: string): Promise<void> => {
    if (liveMessageId === undefined) {
      await api.sendMessage({ chatId, text });
      return;
    }
    if (text === renderedText) {
      return;
    }
    try {
      await api.editMessageText({ chatId, messageId: liveMessageId, text });
    } catch (error: unknown) {
      reportLiveReplyError(error);
      // The live message still shows partial text: deliver the real reply.
      await api.sendMessage({ chatId, text });
    }
  };

  const pushDelta = (text: string): void => {
    streamed += text;
    if (isFlushDue()) {
      scheduleFlush();
    }
  };

  const finish = async (finalText: string): Promise<void> => {
    while (inFlight !== undefined) {
      await inFlight;
    }

    const [firstChunk, ...remainingChunks] = chunkTelegramText(finalText);
    if (firstChunk === undefined) {
      return;
    }

    await settleLiveMessage(firstChunk);
    for (const chunk of remainingChunks) {
      await api.sendMessage({ chatId, text: chunk });
    }
  };

  return { pushDelta, finish };
}

function reportLiveReplyError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[telegram] Live reply update failed: ${message}`);
}
