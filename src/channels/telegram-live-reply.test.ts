import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TELEGRAM_MAX_MESSAGE_LENGTH } from './telegram-api.js';
import {
  createTelegramLiveReply,
  LIVE_REPLY_FLUSH_CHARS,
  LIVE_REPLY_FLUSH_INTERVAL_MS,
  type LiveReplyApi,
} from './telegram-live-reply.js';

const CHAT_ID = 555;

describe('createTelegramLiveReply', () => {
  it('debería_no_tocar_la_API_cuando_el_buffer_no_llega_al_umbral', async () => {
    const telegram = createFakeTelegram();
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });

    liveReply.pushDelta('corto');
    await liveReply.finish('corto');

    assert.deepEqual(telegram.sentTexts, ['corto']);
    assert.deepEqual(telegram.editedTexts, []);
  });

  it('debería_enviar_el_mensaje_vivo_cuando_se_acumulan_suficientes_caracteres', async () => {
    const telegram = createFakeTelegram();
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });
    const streamed = 'a'.repeat(LIVE_REPLY_FLUSH_CHARS);

    liveReply.pushDelta(streamed);
    await liveReply.finish(`${streamed} fin`);

    assert.deepEqual(telegram.sentTexts, [streamed]);
    assert.deepEqual(telegram.editedTexts, [`${streamed} fin`]);
  });

  it('debería_enviar_el_mensaje_vivo_cuando_pasa_el_intervalo_de_throttle', async () => {
    const telegram = createFakeTelegram();
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });

    liveReply.pushDelta('hola');
    telegram.advance(LIVE_REPLY_FLUSH_INTERVAL_MS);
    liveReply.pushDelta(' mundo');
    await liveReply.finish('hola mundo');

    assert.deepEqual(telegram.sentTexts, ['hola mundo']);
  });

  it('debería_omitir_la_edición_final_cuando_el_texto_ya_es_el_mostrado', async () => {
    const telegram = createFakeTelegram();
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });
    const streamed = 'b'.repeat(LIVE_REPLY_FLUSH_CHARS);

    liveReply.pushDelta(streamed);
    await liveReply.finish(streamed);

    assert.deepEqual(telegram.editedTexts, []);
  });

  it('debería_partir_la_respuesta_final_cuando_excede_el_límite_de_Telegram', async () => {
    const telegram = createFakeTelegram();
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });
    const streamed = 'c'.repeat(LIVE_REPLY_FLUSH_CHARS);
    const longReply = `${'d'.repeat(TELEGRAM_MAX_MESSAGE_LENGTH)} cola`;

    liveReply.pushDelta(streamed);
    await liveReply.finish(longReply);

    assert.equal(telegram.editedTexts.length, 1);
    assert.equal(telegram.sentTexts.length, 2);
    assert.equal(telegram.sentTexts[1], 'cola');
  });

  it('debería_enviar_la_respuesta_como_mensaje_nuevo_cuando_la_edición_final_falla', async () => {
    const telegram = createFakeTelegram({ failEdits: true });
    const liveReply = createTelegramLiveReply({
      api: telegram.api,
      chatId: CHAT_ID,
      now: telegram.now,
    });
    const streamed = 'e'.repeat(LIVE_REPLY_FLUSH_CHARS);

    liveReply.pushDelta(streamed);
    await liveReply.finish('respuesta final');

    assert.deepEqual(telegram.sentTexts, [streamed, 'respuesta final']);
  });
});

interface FakeTelegram {
  readonly api: LiveReplyApi;
  readonly sentTexts: string[];
  readonly editedTexts: string[];
  readonly now: () => number;
  readonly advance: (ms: number) => void;
}

function createFakeTelegram(
  options: { readonly failEdits?: boolean } = {},
): FakeTelegram {
  const sentTexts: string[] = [];
  const editedTexts: string[] = [];
  let clock = 0;
  let nextMessageId = 1;

  const api: LiveReplyApi = {
    sendMessage: async ({ chatId, text }) => {
      sentTexts.push(text);
      return { message_id: nextMessageId++, chat: { id: chatId }, text };
    },
    editMessageText: async ({ chatId, messageId, text }) => {
      if (options.failEdits === true) {
        throw new Error('Bad Request: message is not modified');
      }
      editedTexts.push(text);
      return { message_id: messageId, chat: { id: chatId }, text };
    },
  };

  return {
    api,
    sentTexts,
    editedTexts,
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
  };
}
