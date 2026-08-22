/**
 * Minimal Telegram Bot API client using Node's native `fetch`.
 * Long polling via getUpdates — no public webhook URL required.
 */

export const TELEGRAM_BOT_TOKEN_ENV = 'TELEGRAM_BOT_TOKEN';
export const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Soft cap for sendMessage text (Bot API limit is 4096). */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface TelegramApiOptions {
  readonly token: string;
  readonly fetchFn?: FetchLike;
  readonly apiBase?: string;
}

export interface TelegramUser {
  readonly id: number;
  readonly is_bot?: boolean;
  readonly first_name?: string;
  readonly username?: string;
}

export interface TelegramChat {
  readonly id: number;
  readonly type?: string;
  readonly title?: string;
  readonly username?: string;
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly date?: number;
  readonly chat: TelegramChat;
  readonly from?: TelegramUser;
  readonly text?: string;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
  readonly callback_query?: CallbackQuery;
}

export interface GetUpdatesParams {
  readonly offset?: number;
  readonly timeout?: number;
  readonly limit?: number;
}

export interface InlineKeyboardButton {
  readonly text: string;
  readonly callback_data?: string;
}

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: readonly InlineKeyboardButton[][];
}

export interface SendMessageParams {
  readonly chatId: number;
  readonly text: string;
  readonly reply_markup?: InlineKeyboardMarkup;
}

export interface EditMessageTextParams {
  readonly chatId: number;
  readonly messageId: number;
  readonly text: string;
  readonly reply_markup?: InlineKeyboardMarkup;
}

export interface CallbackQuery {
  readonly id: string;
  readonly from: TelegramUser;
  readonly message?: TelegramMessage;
  readonly data?: string;
}

export interface AnswerCallbackQueryParams {
  readonly callbackQueryId: string;
  readonly text?: string;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly description: string;

  constructor(method: string, description: string) {
    super(`Telegram API ${method} failed: ${description}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.description = description;
  }
}

/**
 * Reads `TELEGRAM_BOT_TOKEN` from the given env map. Throws a clear setup
 * message when missing — never invents or hardcodes a token.
 */
export function requireTelegramBotToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env[TELEGRAM_BOT_TOKEN_ENV];
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (token === '') {
    throw new Error(
      [
        `${TELEGRAM_BOT_TOKEN_ENV} is not set.`,
        'Create a bot with @BotFather, then export the token before starting:',
        '',
        `  export ${TELEGRAM_BOT_TOKEN_ENV}="<token from BotFather>"`,
        '  npm run telegram',
        '',
        'Do not commit the token. Keep it only in your shell / secret manager.',
      ].join('\n'),
    );
  }
  return token;
}

export function createTelegramApi(options: TelegramApiOptions): TelegramApi {
  return new TelegramApi(options);
}

export class TelegramApi {
  private readonly token: string;
  private readonly fetchFn: FetchLike;
  private readonly apiBase: string;

  constructor(options: TelegramApiOptions) {
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.apiBase = options.apiBase ?? TELEGRAM_API_BASE;
  }

  async getUpdates(params: GetUpdatesParams = {}): Promise<TelegramUpdate[]> {
    const query = new URLSearchParams();
    if (params.offset !== undefined) {
      query.set('offset', String(params.offset));
    }
    if (params.timeout !== undefined) {
      query.set('timeout', String(params.timeout));
    }
    if (params.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const result = await this.callApi<TelegramUpdate[]>(`getUpdates${suffix}`);
    return result;
  }

  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      text: params.text,
    };
    if (params.reply_markup !== undefined) {
      body.reply_markup = params.reply_markup;
    }
    return await this.callApi<TelegramMessage>('sendMessage', body);
  }

  /** Replaces the text of an already sent message (used for live streaming). */
  async editMessageText(
    params: EditMessageTextParams,
  ): Promise<TelegramMessage> {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      message_id: params.messageId,
      text: params.text,
    };
    if (params.reply_markup !== undefined) {
      body.reply_markup = params.reply_markup;
    }
    return await this.callApi<TelegramMessage>('editMessageText', body);
  }

  /** Answers a callback query (inline keyboard button press). */
  async answerCallbackQuery(params: AnswerCallbackQueryParams): Promise<boolean> {
    const body: Record<string, unknown> = {
      callback_query_id: params.callbackQueryId,
    };
    if (params.text !== undefined) {
      body.text = params.text;
    }
    return await this.callApi<boolean>('answerCallbackQuery', body);
  }

  /**
   * Splits text into chunks that fit Telegram's message limit and sends each.
   * Returns the messages that were sent (one per chunk).
   */
  async sendTextChunked(
    chatId: number,
    text: string,
    maxLength: number = TELEGRAM_MAX_MESSAGE_LENGTH,
  ): Promise<TelegramMessage[]> {
    const chunks = chunkTelegramText(text, maxLength);
    const sent: TelegramMessage[] = [];
    for (const chunk of chunks) {
      sent.push(await this.sendMessage({ chatId, text: chunk }));
    }
    return sent;
  }

  private async callApi<T>(
    methodAndQuery: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const method = methodAndQuery.split('?')[0] ?? methodAndQuery;
    const url = `${this.apiBase}/bot${this.token}/${methodAndQuery}`;
    const init: RequestInit =
      body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          };

    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TelegramApiError(method, `network error: ${message}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TelegramApiError(
        method,
        `non-JSON response (HTTP ${String(response.status)})`,
      );
    }

    if (!isTelegramOkResponse(payload)) {
      const description =
        isRecord(payload) && typeof payload['description'] === 'string'
          ? payload['description']
          : `HTTP ${String(response.status)}`;
      throw new TelegramApiError(method, description);
    }

    return payload.result as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTelegramOkResponse(
  value: unknown,
): value is { ok: true; result: unknown } {
  return isRecord(value) && value['ok'] === true && 'result' in value;
}

/** Split on paragraph/line boundaries when possible; hard-split as fallback. */
export function chunkTelegramText(
  text: string,
  maxLength: number = TELEGRAM_MAX_MESSAGE_LENGTH,
): string[] {
  const trimmed = text.trimEnd();
  if (trimmed === '') {
    return ['(empty reply)'];
  }
  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    const breakAt = Math.max(
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('\n'),
      window.lastIndexOf(' '),
    );
    const cut = breakAt > maxLength * 0.5 ? breakAt : maxLength;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}
