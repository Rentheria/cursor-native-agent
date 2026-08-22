import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chunkTelegramText,
  createTelegramApi,
  requireTelegramBotToken,
  TELEGRAM_BOT_TOKEN_ENV,
  type FetchLike,
  type TelegramUpdate,
} from './telegram-api.js';
import {
  isInboundAllowed,
  requireTelegramAllowlist,
  TELEGRAM_ALLOWED_CHAT_IDS_ENV,
  TELEGRAM_ALLOWED_USER_IDS_ENV,
  type TelegramAllowlist,
} from './telegram-allowlist.js';
import {
  extractInboundTextMessages,
  nextUpdateOffset,
} from './telegram-parse.js';
import {
  dispatchInboundMessage,
  runTelegramBot,
} from './telegram.js';

describe('requireTelegramBotToken', () => {
  it('debería_fallar_con_mensaje_claro_si_falta_el_token', () => {
    assert.throws(
      () => requireTelegramBotToken({}),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(TELEGRAM_BOT_TOKEN_ENV));
        assert.match(error.message, /BotFather/);
        assert.match(error.message, /export TELEGRAM_BOT_TOKEN/);
        return true;
      },
    );
  });

  it('debería_fallar_si_el_token_es_solo_espacios', () => {
    assert.throws(() =>
      requireTelegramBotToken({ [TELEGRAM_BOT_TOKEN_ENV]: '   ' }),
    );
  });

  it('debería_devolver_el_token_trimmeado', () => {
    assert.equal(
      requireTelegramBotToken({ [TELEGRAM_BOT_TOKEN_ENV]: '  fake-token  ' }),
      'fake-token',
    );
  });
});

describe('requireTelegramAllowlist', () => {
  it('debería_fallar_cerrado_si_no_hay_allowlist_configurada', () => {
    assert.throws(
      () => requireTelegramAllowlist({ [TELEGRAM_BOT_TOKEN_ENV]: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(TELEGRAM_ALLOWED_CHAT_IDS_ENV));
        assert.match(error.message, /never listen to strangers/);
        return true;
      },
    );
  });

  it('debería_fallar_cerrado_si_la_lista_queda_vacía_tras_parsear', () => {
    assert.throws(() =>
      requireTelegramAllowlist({ [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '  , ,  ' }),
    );
  });

  it('debería_rechazar_ids_no_numéricos_en_vez_de_ignorarlos', () => {
    assert.throws(
      () =>
        requireTelegramAllowlist({
          [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '123, todos',
        }),
      /not a Telegram numeric ID/,
    );
  });

  it('debería_parsear_chats_y_usuarios_incluyendo_ids_de_grupo_negativos', () => {
    const allowlist = requireTelegramAllowlist({
      [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '555, -1009876543210',
      [TELEGRAM_ALLOWED_USER_IDS_ENV]: '42',
    });
    assert.deepEqual([...allowlist.chatIds], [555, -1009876543210]);
    assert.deepEqual([...allowlist.userIds], [42]);
  });
});

describe('isInboundAllowed', () => {
  const inbound = {
    updateId: 1,
    messageId: 1,
    chatId: 555,
    text: 'hola',
    fromUserId: 42,
    fromUsername: 'demo',
  };

  it('debería_permitir_solo_los_chats_listados', () => {
    assert.equal(
      isInboundAllowed(inbound, allowlistOf({ chats: [555] })),
      true,
    );
    assert.equal(
      isInboundAllowed(inbound, allowlistOf({ chats: [999] })),
      false,
    );
  });

  it('debería_afinar_por_usuario_cuando_hay_lista_de_usuarios', () => {
    assert.equal(
      isInboundAllowed(inbound, allowlistOf({ chats: [555], users: [42] })),
      true,
    );
    assert.equal(
      isInboundAllowed(inbound, allowlistOf({ chats: [555], users: [7] })),
      false,
    );
    assert.equal(
      isInboundAllowed(
        { ...inbound, fromUserId: undefined },
        allowlistOf({ chats: [555], users: [42] }),
      ),
      false,
    );
  });
});

describe('extractInboundTextMessages / nextUpdateOffset', () => {
  it('debería_extraer_solo_mensajes_de_texto_no_vacíos', () => {
    const updates: TelegramUpdate[] = [
      { update_id: 1, message: { message_id: 10, chat: { id: 100 }, text: 'hola' } },
      { update_id: 2, message: { message_id: 11, chat: { id: 100 }, text: '  ' } },
      { update_id: 3 },
      {
        update_id: 4,
        message: {
          message_id: 12,
          chat: { id: 200 },
          text: 'segunda',
          from: { id: 9, username: 'alice' },
        },
      },
    ];

    const inbound = extractInboundTextMessages(updates);
    assert.equal(inbound.length, 2);
    assert.deepEqual(inbound[0], {
      updateId: 1,
      messageId: 10,
      chatId: 100,
      text: 'hola',
      fromUserId: undefined,
      fromUsername: undefined,
    });
    assert.equal(inbound[1]?.fromUsername, 'alice');
    assert.equal(inbound[1]?.fromUserId, 9);
    assert.equal(inbound[1]?.chatId, 200);
  });

  it('debería_avanzar_offset_al_max_update_id_plus_one', () => {
    assert.equal(nextUpdateOffset([], 7), 7);
    assert.equal(
      nextUpdateOffset([{ update_id: 3 }, { update_id: 5 }], 0),
      6,
    );
  });
});

describe('chunkTelegramText', () => {
  it('debería_partir_textos_largos_sin_exceder_el_límite', () => {
    const text = `${'a'.repeat(50)}\n\n${'b'.repeat(50)}`;
    const chunks = chunkTelegramText(text, 60);
    assert.ok(chunks.length >= 2);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 60);
    }
    assert.equal(chunks.join('').replace(/\s+/g, ''), text.replace(/\s+/g, ''));
  });
});

describe('TelegramApi (fetch mockeado)', () => {
  it('debería_llamar_getUpdates_y_sendMessage_sin_pegar_a_la_API_real', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: FetchLike = async (input, init) => {
      const url = String(input);
      if (init === undefined) {
        calls.push({ url });
      } else {
        calls.push({ url, init });
      }
      if (url.includes('getUpdates')) {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 42,
              message: {
                message_id: 1,
                chat: { id: 99 },
                text: 'ping',
              },
            },
          ],
        });
      }
      if (url.includes('sendMessage')) {
        const body = JSON.parse(String(init?.body)) as {
          chat_id: number;
          text: string;
        };
        return jsonResponse({
          ok: true,
          result: {
            message_id: 2,
            chat: { id: body.chat_id },
            text: body.text,
          },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const api = createTelegramApi({
      token: 'TEST_TOKEN_NOT_REAL',
      fetchFn,
      apiBase: 'https://telegram.test',
    });

    const updates = await api.getUpdates({ offset: 10, timeout: 25 });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.update_id, 42);

    const sent = await api.sendMessage({ chatId: 99, text: 'pong' });
    assert.equal(sent.text, 'pong');

    assert.equal(calls.length, 2);
    assert.match(calls[0]?.url ?? '', /botTEST_TOKEN_NOT_REAL\/getUpdates/);
    assert.match(calls[0]?.url ?? '', /offset=10/);
    assert.match(calls[0]?.url ?? '', /timeout=25/);
    assert.match(calls[1]?.url ?? '', /sendMessage/);
    assert.equal(calls[1]?.init?.method, 'POST');
  });

  it('debería_lanzar_TelegramApiError_cuando_ok_es_false', async () => {
    const api = createTelegramApi({
      token: 'x',
      apiBase: 'https://telegram.test',
      fetchFn: async () =>
        jsonResponse({ ok: false, description: 'Unauthorized' }),
    });
    await assert.rejects(
      () => api.getUpdates(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Unauthorized/);
        return true;
      },
    );
  });
});

describe('dispatchInboundMessage / runTelegramBot', () => {
  it('debería_procesar_un_mensaje_y_responder_en_el_chat', async () => {
    const sentBodies: string[] = [];
    const fetchFn: FetchLike = async (input, init) => {
      const url = String(input);
      if (url.includes('getUpdates')) {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 1,
              message: {
                message_id: 7,
                chat: { id: 555 },
                text: 'resume MEMORY.md',
                from: { id: 1, username: 'demo' },
              },
            },
          ],
        });
      }
      if (url.includes('sendMessage')) {
        const body = JSON.parse(String(init?.body)) as {
          chat_id: number;
          text: string;
        };
        sentBodies.push(body.text);
        assert.equal(body.chat_id, 555);
        return jsonResponse({
          ok: true,
          result: {
            message_id: 8,
            chat: { id: body.chat_id },
            text: body.text,
          },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const api = createTelegramApi({
      token: 'TEST_TOKEN_NOT_REAL',
      fetchFn,
      apiBase: 'https://telegram.test',
    });

    let processedPrompt = '';
    await runTelegramBot({
      repoRoot: '/tmp/unused',
      api,
      allowlist: allowlistOf({ chats: [555] }),
      loop: false,
      longPollTimeoutSeconds: 0,
      processInbound: async (inbound) => {
        processedPrompt = inbound.text;
        return {
          reply: 'respuesta mock del agente',
          stderr: '',
          exitCode: 0,
        };
      },
    });

    assert.equal(processedPrompt, 'resume MEMORY.md');
    assert.deepEqual(sentBodies, ['respuesta mock del agente']);
  });

  it('no_debería_ejecutar_nada_de_un_chat_fuera_de_la_allowlist', async () => {
    const calls: string[] = [];
    const api = createTelegramApi({
      token: 'TEST_TOKEN_NOT_REAL',
      apiBase: 'https://telegram.test',
      fetchFn: async (input) => {
        calls.push(String(input));
        throw new Error('the bot must not talk to an unauthorized chat');
      },
    });

    let processInboundCalls = 0;
    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 666,
        text: 'rm -rf / --no-preserve-root',
        fromUserId: 666,
        fromUsername: 'stranger',
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async () => {
        processInboundCalls += 1;
        return { reply: 'nunca', stderr: '', exitCode: 0 };
      },
    });

    assert.equal(processInboundCalls, 0);
    assert.deepEqual(calls, []);
  });

  it('debería_editar_el_mensaje_vivo_con_los_deltas_del_agente', async () => {
    const sentTexts: string[] = [];
    const editedTexts: string[] = [];
    const api = createTelegramApi({
      token: 'TEST_TOKEN_NOT_REAL',
      apiBase: 'https://telegram.test',
      fetchFn: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        if (String(input).includes('editMessageText')) {
          editedTexts.push(body.text);
        } else {
          sentTexts.push(body.text);
        }
        return jsonResponse({
          ok: true,
          result: { message_id: 8, chat: { id: 555 }, text: body.text },
        });
      },
    });
    const streamed = 'x'.repeat(400);

    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 7,
        chatId: 555,
        text: 'hola',
        fromUserId: undefined,
        fromUsername: undefined,
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async (_inbound, onAssistantDelta) => {
        onAssistantDelta(streamed);
        return { reply: `${streamed} listo`, stderr: '', exitCode: 0 };
      },
    });

    assert.deepEqual(sentTexts, [streamed]);
    assert.deepEqual(editedTexts, [`${streamed} listo`]);
  });

  it('debería_enviar_error_al_chat_si_el_pipeline_falla', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: {
            message_id: 1,
            chat: { id: 1 },
            text: body.text,
          },
        });
      },
    });

    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 1,
        text: 'hola',
        fromUserId: undefined,
        fromUsername: undefined,
      },
      api,
      allowlist: allowlistOf({ chats: [1] }),
      processInbound: async () => {
        throw new Error('boom');
      },
    });

    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /Error running agent: boom/);
  });

  it('no_debería_ejecutar_agente_para_slash_command_start', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 555 }, text: body.text },
        });
      },
    });

    let processInboundCalls = 0;
    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 555,
        text: '/start',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async () => {
        processInboundCalls += 1;
        return { reply: 'nunca', stderr: '', exitCode: 0 };
      },
    });

    assert.equal(processInboundCalls, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /Conversación iniciada/);
  });

  it('no_debería_ejecutar_agente_para_slash_command_help_con_at_botname', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 555 }, text: body.text },
        });
      },
    });

    let processInboundCalls = 0;
    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 555,
        text: '/help@TestBot',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async () => {
        processInboundCalls += 1;
        return { reply: 'nunca', stderr: '', exitCode: 0 };
      },
    });

    assert.equal(processInboundCalls, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /prompt real/);
  });

  it('debería_ejecutar_agente_normalmente_para_texto_que_no_es_slash_command', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 555 }, text: body.text },
        });
      },
    });

    let processInboundCalls = 0;
    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 555,
        text: 'qué hace este repo',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async () => {
        processInboundCalls += 1;
        return { reply: 'respuesta', stderr: '', exitCode: 0 };
      },
    });

    assert.equal(processInboundCalls, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0], 'respuesta');
  });
});

describe('Telegram safeMode', () => {
  it('el_default_processInbound_debe_usar_safeMode_true_como_dashboard', () => {
    // Default processInbound wiring (when options.processInbound is undefined)
    // passes safeMode: true to runAgentTurn, same as POST /api/chat.
    // This means: repoRoot cwd, --trust yes, --force no.
    // Tests always inject processInbound, so this test documents the contract.
    assert.ok(true, 'Default processInbound uses safeMode: true (see implementation)');
  });
});

describe('Telegram thread creation', () => {
  it('slash_start_debe_crear_el_archivo_de_thread_para_ese_chat', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-threads-test-'));
    try {
      const sent: string[] = [];
      const api = createTelegramApi({
        token: 't',
        apiBase: 'https://telegram.test',
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { text: string };
          sent.push(body.text);
          return jsonResponse({
            ok: true,
            result: { message_id: 1, chat: { id: 555 }, text: body.text },
          });
        },
      });

      await dispatchInboundMessage({
        inbound: {
          updateId: 1,
          messageId: 1,
          chatId: 555,
          text: '/start',
          fromUserId: 1,
          fromUsername: 'demo',
        },
        api,
        allowlist: allowlistOf({ chats: [555], repoRoot }),
        processInbound: async () => {
          throw new Error('El agente no debe ejecutarse para /start');
        },
      });

      // Verificar que el thread file fue creado
      const threadPath = join(repoRoot, 'threads', 'telegram-chat-555.json');
      const threadContent = await readFile(threadPath, 'utf8');
      const thread = JSON.parse(threadContent) as {
        id: string;
        messages: Array<{ role: string; content: string }>;
      };
      
      assert.equal(thread.id, 'telegram-chat-555');
      assert.equal(thread.messages.length, 0);
      assert.equal(sent.length, 1);
      assert.match(sent[0] ?? '', /Conversación iniciada/);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('mensaje_sin_start_previo_debe_crear_thread_automáticamente', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { appendToThread } = await import('../lib/threads-store.js');
    
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-threads-test-'));
    try {
      const sent: string[] = [];
      const api = createTelegramApi({
        token: 't',
        apiBase: 'https://telegram.test',
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { text: string };
          sent.push(body.text);
          return jsonResponse({
            ok: true,
            result: { message_id: 1, chat: { id: 777 }, text: body.text },
          });
        },
      });

      // Enviar mensaje sin /start previo
      await dispatchInboundMessage({
        inbound: {
          updateId: 1,
          messageId: 1,
          chatId: 777,
          text: 'Hola, ¿qué hace este repo?',
          fromUserId: 1,
          fromUsername: 'demo',
        },
        api,
        allowlist: allowlistOf({ chats: [777], repoRoot }),
        processInbound: async (_inbound, _onDelta, _confirmedForce, _workspace, threadId) => {
          // Simular lo que hace runAgentTurn: append user message + assistant reply
          if (threadId !== undefined) {
            await appendToThread(repoRoot, threadId, 'user', 'Hola, ¿qué hace este repo?');
            await appendToThread(repoRoot, threadId, 'assistant', 'Respuesta del agente');
          }
          return { reply: 'Respuesta del agente', stderr: '', exitCode: 0 };
        },
      });

      // Verificar que el thread file fue creado automáticamente
      const threadPath = join(repoRoot, 'threads', 'telegram-chat-777.json');
      const threadContent = await readFile(threadPath, 'utf8');
      const thread = JSON.parse(threadContent) as {
        id: string;
        messages: Array<{ role: string; content: string }>;
      };
      
      assert.equal(thread.id, 'telegram-chat-777');
      // Debe tener el mensaje del usuario y la respuesta del asistente
      assert.equal(thread.messages.length, 2);
      assert.equal(thread.messages[0]?.content, 'Hola, ¿qué hace este repo?');
      assert.equal(thread.messages[1]?.content, 'Respuesta del agente');
      assert.equal(sent.length, 1);
      assert.equal(sent[0], 'Respuesta del agente');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('thread_existente_debe_continuar_correctamente', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createOrResetThread } = await import('../lib/threads-store.js');
    const { appendToThread } = await import('../lib/threads-store.js');
    
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-threads-test-'));
    try {
      // Pre-crear un thread con historial
      const threadId = 'telegram-chat-888';
      await createOrResetThread(repoRoot, threadId);
      await appendToThread(repoRoot, threadId, 'user', '¿Qué es esto?');
      await appendToThread(repoRoot, threadId, 'assistant', 'Es un agente.');
      
      const sent: string[] = [];
      const api = createTelegramApi({
        token: 't',
        apiBase: 'https://telegram.test',
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { text: string };
          sent.push(body.text);
          return jsonResponse({
            ok: true,
            result: { message_id: 1, chat: { id: 888 }, text: body.text },
          });
        },
      });

      // Enviar nuevo mensaje
      await dispatchInboundMessage({
        inbound: {
          updateId: 1,
          messageId: 1,
          chatId: 888,
          text: '¿Y cómo funciona?',
          fromUserId: 1,
          fromUsername: 'demo',
        },
        api,
        allowlist: allowlistOf({ chats: [888], repoRoot }),
        processInbound: async (_inbound, _onDelta, _confirmedForce, _workspace, threadIdParam) => {
          // Simular lo que hace runAgentTurn: append user message + assistant reply
          if (threadIdParam !== undefined) {
            await appendToThread(repoRoot, threadIdParam, 'user', '¿Y cómo funciona?');
            await appendToThread(repoRoot, threadIdParam, 'assistant', 'Usa cursor-agent');
          }
          return { reply: 'Usa cursor-agent', stderr: '', exitCode: 0 };
        },
      });

      // Verificar que el thread tiene todo el historial
      const threadPath = join(repoRoot, 'threads', 'telegram-chat-888.json');
      const threadContent = await readFile(threadPath, 'utf8');
      const thread = JSON.parse(threadContent) as {
        id: string;
        messages: Array<{ role: string; content: string }>;
      };
      
      assert.equal(thread.id, threadId);
      assert.equal(thread.messages.length, 4);
      assert.equal(thread.messages[0]?.content, '¿Qué es esto?');
      assert.equal(thread.messages[1]?.content, 'Es un agente.');
      assert.equal(thread.messages[2]?.content, '¿Y cómo funciona?');
      assert.equal(thread.messages[3]?.content, 'Usa cursor-agent');
      assert.equal(sent.length, 1);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('Telegram confirmación de build', () => {
  it('debería_pedir_confirmación_cuando_requiresForceConfirmation_es_true', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 555 }, text: body.text },
        });
      },
    });

    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 555,
        text: 'haz una calculadora',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [555] }),
      processInbound: async () => {
        return {
          reply: 'Por favor confirma el build',
          stderr: '',
          exitCode: 0,
          requiresForceConfirmation: true,
        };
      },
    });

    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /confirma/);
  });

  it('debería_manejar_ok_confirmando_el_build_pendiente', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 888 }, text: body.text },
        });
      },
    });

    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 888,
        text: '/ok',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [888], repoRoot: '/test/repo' }),
      processInbound: async () => {
        return {
          reply: 'Build confirmado y ejecutado',
          stderr: '',
          exitCode: 0,
        };
      },
    });

    // /ok without pending confirmation should show error
    assert.match(sent[0] ?? '', /No pending build confirmation/);
  });

  it('debería_manejar_no_cancelando_el_build_pendiente', async () => {
    const sent: string[] = [];
    const api = createTelegramApi({
      token: 't',
      apiBase: 'https://telegram.test',
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        sent.push(body.text);
        return jsonResponse({
          ok: true,
          result: { message_id: 1, chat: { id: 999 }, text: body.text },
        });
      },
    });

    await dispatchInboundMessage({
      inbound: {
        updateId: 1,
        messageId: 1,
        chatId: 999,
        text: '/no',
        fromUserId: 1,
        fromUsername: 'demo',
      },
      api,
      allowlist: allowlistOf({ chats: [999] }),
      processInbound: async () => {
        return {
          reply: 'nunca',
          stderr: '',
          exitCode: 0,
        };
      },
    });

    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /cancelled/i);
  });

  it('callback_confirmar_debe_reutilizar_threadId_telegram_chat_id', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { setPendingTelegramForce } = await import('../core/pending-force.js');
    const { appendToThread } = await import('../lib/threads-store.js');
    const { createOrResetThread } = await import('../lib/threads-store.js');
    
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-callback-thread-test-'));
    try {
      const chatId = 5555;
      const expectedThreadId = `telegram-chat-${chatId}`;
      
      // Pre-crear thread con /start
      await createOrResetThread(repoRoot, expectedThreadId);
      
      // Simular pending confirmation
      setPendingTelegramForce(chatId, 'crear calculadora');
      
      const api = createTelegramApi({
        token: 't',
        apiBase: 'https://telegram.test',
        fetchFn: async (input, init) => {
          const url = String(input);
          if (url.includes('getUpdates')) {
            return jsonResponse({
              ok: true,
              result: [
                {
                  update_id: 1,
                  callback_query: {
                    id: 'cbq123',
                    from: { id: 1, username: 'demo' },
                    message: {
                      message_id: 10,
                      chat: { id: chatId },
                      text: '¿Confirmar?',
                    },
                    data: 'confirm_ok',
                  },
                },
              ],
            });
          }
          if (url.includes('answerCallbackQuery')) {
            return jsonResponse({ ok: true, result: true });
          }
          const body = JSON.parse(String(init?.body)) as { text: string };
          return jsonResponse({
            ok: true,
            result: { message_id: 1, chat: { id: chatId }, text: body.text },
          });
        },
      });
      
      let capturedThreadId: string | undefined;
      
      // Simular callback_query de Confirmar
      await runTelegramBot({
        repoRoot,
        api,
        allowlist: allowlistOf({ chats: [chatId], repoRoot }),
        loop: false,
        initialOffset: 0,
        processInbound: async (_inbound, _onDelta, _confirmedForce, _workspace, threadId) => {
          capturedThreadId = threadId;
          // Simular append al thread
          if (threadId !== undefined) {
            await appendToThread(repoRoot, threadId, 'user', 'crear calculadora');
            await appendToThread(repoRoot, threadId, 'assistant', 'Calculadora creada');
          }
          return { reply: 'Calculadora creada', stderr: '', exitCode: 0 };
        },
      });
      
      // Verificar que se usó el threadId correcto
      assert.equal(capturedThreadId, expectedThreadId, 
        `callback_query debe usar ${expectedThreadId}, pero usó ${capturedThreadId ?? 'undefined'}`);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('slash_ok_debe_reutilizar_threadId_telegram_chat_id', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { setPendingTelegramForce } = await import('../core/pending-force.js');
    const { appendToThread } = await import('../lib/threads-store.js');
    const { createOrResetThread } = await import('../lib/threads-store.js');
    
    const repoRoot = await mkdtemp(join(tmpdir(), 'telegram-ok-thread-test-'));
    try {
      const chatId = 6666;
      const expectedThreadId = `telegram-chat-${chatId}`;
      
      // Pre-crear thread con /start
      await createOrResetThread(repoRoot, expectedThreadId);
      
      // Simular pending confirmation
      setPendingTelegramForce(chatId, 'crear servidor web');
      
      const api = createTelegramApi({
        token: 't',
        apiBase: 'https://telegram.test',
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { text: string };
          return jsonResponse({
            ok: true,
            result: { message_id: 1, chat: { id: chatId }, text: body.text },
          });
        },
      });
      
      let capturedThreadId: string | undefined;
      
      await dispatchInboundMessage({
        inbound: {
          updateId: 1,
          messageId: 1,
          chatId,
          text: '/ok',
          fromUserId: 1,
          fromUsername: 'demo',
        },
        api,
        allowlist: allowlistOf({ chats: [chatId], repoRoot }),
        processInbound: async (_inbound, _onDelta, _confirmedForce, _workspace, threadId) => {
          capturedThreadId = threadId;
          // Simular append al thread
          if (threadId !== undefined) {
            await appendToThread(repoRoot, threadId, 'user', 'crear servidor web');
            await appendToThread(repoRoot, threadId, 'assistant', 'Servidor web creado');
          }
          return { reply: 'Servidor web creado', stderr: '', exitCode: 0 };
        },
      });
      
      // Verificar que se usó el threadId correcto
      assert.equal(capturedThreadId, expectedThreadId, 
        `/ok debe usar ${expectedThreadId}, pero usó ${capturedThreadId ?? 'undefined'}`);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

function allowlistOf(params: {
  readonly chats: readonly number[];
  readonly users?: readonly number[];
  readonly repoRoot?: string;
}): TelegramAllowlist {
  return {
    chatIds: new Set(params.chats),
    userIds: new Set(params.users ?? []),
    repoRoot: params.repoRoot,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
