import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { escapeHtml } from './html.js';
import {
  DEFAULT_DASHBOARD_PORT,
  createDashboardServer,
  handleRequest,
  isDashboardChatEnabled,
  resolveDashboardPort,
} from './server.js';

describe('resolveDashboardPort', () => {
  it('debería_usar_default_cuando_PORT_no_está', () => {
    assert.equal(resolveDashboardPort({}), DEFAULT_DASHBOARD_PORT);
  });

  it('debería_leer_PORT_del_entorno', () => {
    assert.equal(resolveDashboardPort({ PORT: '4090' }), 4090);
  });

  it('debería_rechazar_PORT_inválido', () => {
    assert.throws(() => resolveDashboardPort({ PORT: 'nope' }), /Invalid PORT/);
  });
});

describe('escapeHtml', () => {
  it('debería_escapar_caracteres_peligrosos', () => {
    assert.equal(
      escapeHtml(`<script>"x"&'y'</script>`),
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });
});

describe('dashboard HTTP routes (read-only)', () => {
  let tmpRoot = '';
  let baseUrl = '';
  let server: ReturnType<typeof createServer> | undefined;

  before(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-dash-'));
    await mkdir(path.join(tmpRoot, 'logs'), { recursive: true });
    await writeFile(
      path.join(tmpRoot, 'logs/agent.ndjson'),
      `${JSON.stringify({
        ts: '2026-08-05T12:00:00.000Z',
        prompt: 'hola dashboard',
        skillsMatched: ['stage-pitch'],
        memory: { indexEntries: 2, loadedDetails: [] },
      })}\n`,
      'utf8',
    );
    await writeFile(
      path.join(tmpRoot, 'logs/cron.log'),
      [
        '=== CRON FINDING 2026-08-05T12:00:00.000Z ===',
        'finished: 2026-08-05T12:00:08.000Z',
        'exit:     0',
        'branch:   feat/dashboard-web',
        'latest:   abc1234 feat: dashboard',
        'tree:     clean',
        'verdict:  READY — working tree clean; safe to show on stage',
        'note:     Dashboard fixtures look good.',
        '===',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(tmpRoot, 'MEMORY.md'),
      [
        '# MEMORY',
        '',
        '- [Agent architecture](memory/agent-architecture.md) — skills + MEMORY.md',
        '',
      ].join('\n'),
      'utf8',
    );

    server = createDashboardServer({ repoRoot: tmpRoot, chatEnabled: false });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => {
        server!.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      if (server === undefined) {
        resolve();
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('debería_servir_HTML_en_/_con_secciones_clave', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(res.headers.get('x-dashboard-mode'), 'read-only');
    const html = await res.text();
    assert.match(html, /cursor-native-agent/);
    assert.match(html, /hola dashboard/);
    assert.match(html, /feat\/dashboard-web/);
    assert.match(html, /Agent architecture/);
    assert.match(html, /read-only/i);
  });

  it('debería_exponer_JSON_de_agent_cron_y_memory', async () => {
    const agent = await fetch(`${baseUrl}/api/agent`);
    assert.equal(agent.status, 200);
    const agentBody = (await agent.json()) as {
      turns: Array<{ prompt: string; skillsMatched: string[] }>;
    };
    assert.equal(agentBody.turns[0]?.prompt, 'hola dashboard');
    assert.deepEqual(agentBody.turns[0]?.skillsMatched, ['stage-pitch']);

    const cron = await fetch(`${baseUrl}/api/cron`);
    assert.equal(cron.status, 200);
    const cronBody = (await cron.json()) as {
      findings: Array<{ branch: string; note?: string }>;
    };
    assert.equal(cronBody.findings[0]?.branch, 'feat/dashboard-web');
    assert.equal(cronBody.findings[0]?.note, 'Dashboard fixtures look good.');

    const memory = await fetch(`${baseUrl}/api/memory`);
    assert.equal(memory.status, 200);
    const memoryBody = (await memory.json()) as {
      entries: Array<{ title: string }>;
      indexMarkdown: string;
    };
    assert.equal(memoryBody.entries[0]?.title, 'Agent architecture');
    assert.match(memoryBody.indexMarkdown, /MEMORY/);
  });

  it('debería_rechazar_métodos_que_no_sean_GET', async () => {
    const res = await fetch(`${baseUrl}/api/agent`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 405);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'method_not_allowed');
  });

  it('debería_responder_404_en_rutas_desconocidas', async () => {
    const res = await fetch(`${baseUrl}/api/run-agent`);
    assert.equal(res.status, 404);
  });

  it('debería_responder_health_ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; readOnly: boolean; chatEnabled: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.readOnly, true);
    assert.equal(body.chatEnabled, false);
  });

  it('debería_manejar_request_vía_handleRequest_exportado', async () => {
    const req = {
      method: 'GET',
      url: '/api/health',
    } as unknown as import('node:http').IncomingMessage;

    let body = '';
    const headers = new Map<string, string>();
    const res = {
      statusCode: 0,
      setHeader(name: string, value: string | number) {
        headers.set(name.toLowerCase(), String(value));
      },
      end(chunk?: string) {
        body = chunk ?? '';
      },
    };

    const mockServer = {
      address() {
        return { port: 3847, family: 'IPv4', address: '127.0.0.1' };
      },
    } as unknown as import('node:http').Server;

    const rateLimitMap = new Map();

    await handleRequest(
      req,
      res as unknown as import('node:http').ServerResponse,
      { repoRoot: tmpRoot, chatEnabled: false },
      rateLimitMap,
      mockServer,
    );
    assert.equal(res.statusCode, 200);
    assert.match(body, /"ok": true/);
    assert.equal(headers.get('x-dashboard-mode'), 'read-only');
  });

  it('debería_incluir_latencias_en_/api/agent_cuando_existen', async () => {
    await writeFile(
      path.join(tmpRoot, 'logs/agent.ndjson'),
      `${JSON.stringify({
        ts: '2026-08-07T15:00:00.000Z',
        prompt: 'timed turn',
        skillsMatched: [],
        memory: { indexEntries: 1, loadedDetails: [] },
        cursorAgentMs: 7200,
        totalMs: 10100,
      })}\n`,
      'utf8',
    );
    const res = await fetch(`${baseUrl}/api/agent`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      turns: Array<{ prompt: string; cursorAgentMs?: number; totalMs?: number }>;
    };
    assert.equal(body.turns[0]?.prompt, 'timed turn');
    assert.equal(body.turns[0]?.cursorAgentMs, 7200);
    assert.equal(body.turns[0]?.totalMs, 10100);
  });
});

describe('isDashboardChatEnabled', () => {
  it('debería_estar_habilitado_por_defecto', () => {
    assert.equal(isDashboardChatEnabled({}), true);
  });

  it('debería_deshabilitarse_con_0_false_o_off', () => {
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: '0' }), false);
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: 'false' }), false);
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: 'off' }), false);
  });

  it('debería_seguir_habilitado_con_1_true_o_yes', () => {
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: '1' }), true);
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: 'true' }), true);
    assert.equal(isDashboardChatEnabled({ CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: 'yes' }), true);
  });
});

describe('dashboard POST /api/chat (opt-in)', () => {
  let tmpRoot = '';

  before(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-dash-chat-'));
    await mkdir(path.join(tmpRoot, 'logs'), { recursive: true });
  });

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('debería_responder_404_cuando_chat_está_deshabilitado', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: false,
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hola' }),
      });
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'not_found');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_streamear_respuesta_cuando_chat_está_habilitado', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async ({ onAssistantDelta }) => {
        onAssistantDelta?.('ho');
        onAssistantDelta?.('la');
        return { reply: 'hola', stderr: '', exitCode: 0 };
      },
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'di hola' }),
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
      assert.equal(res.headers.get('x-dashboard-mode'), 'chat');
      const text = await res.text();
      assert.match(text, /"type":"delta","text":"ho"/);
      assert.match(text, /"type":"delta","text":"la"/);
      assert.match(text, /"type":"done","reply":"hola"/);

      const page = await fetch(`${baseUrl}/`);
      const html = await page.text();
      assert.match(html, /id="chat-form"/);
      assert.match(html, /POST \/api\/chat/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_omitir_el_recap_del_segmento_en_los_deltas_SSE', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async ({ onAssistantDelta }) => {
        // Segmento que cierra por tool call: cursor-agent lo repite completo.
        onAssistantDelta?.('Voy a revisar ');
        onAssistantDelta?.('el sistema.');
        onAssistantDelta?.('Voy a revisar el sistema.');
        return {
          reply: 'Voy a revisar el sistema.',
          stderr: '',
          exitCode: 0,
        };
      },
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'revisa el sistema' }),
      });
      const deltas = collectSseDeltas(await res.text());

      assert.deepEqual(deltas, ['Voy a revisar ', 'el sistema.']);
      assert.equal(deltas.join(''), 'Voy a revisar el sistema.');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_emitir_error_SSE_cuando_el_turno_falla', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => {
        throw new Error('boom from mock');
      },
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'fail please' }),
      });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /"type":"error"/);
      assert.match(text, /boom from mock/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_prompt_vacío_con_400', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => {
        throw new Error('should not run');
      },
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '   ' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'invalid_prompt');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_origin_externo_con_403', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({ reply: 'ok', stderr: '', exitCode: 0 }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://evil.com',
        },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'forbidden');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_aceptar_origin_localhost_y_127.0.0.1', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({ reply: 'ok', stderr: '', exitCode: 0 }),
    });
    const baseUrl = await listen(server);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;
    try {
      const res1 = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': `http://127.0.0.1:${port}`,
        },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': `http://localhost:${port}`,
        },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res2.status, 200);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_aceptar_request_sin_origin_ni_referer_(curl)', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({ reply: 'ok', stderr: '', exitCode: 0 }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res.status, 200);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_body_mayor_a_256KiB_con_413', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({ reply: 'ok', stderr: '', exitCode: 0 }),
    });
    const baseUrl = await listen(server);
    try {
      const largePrompt = 'a'.repeat(300 * 1024);
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: largePrompt }),
      });
      assert.equal(res.status, 413);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'payload_too_large');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_segundo_request_concurrente_con_429', async () => {
    let firstRunning = false;
    let firstResolve: (() => void) | undefined;
    const firstPromise = new Promise<void>((resolve) => {
      firstResolve = resolve;
    });

    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => {
        if (!firstRunning) {
          firstRunning = true;
          await firstPromise;
          return { reply: 'first', stderr: '', exitCode: 0 };
        }
        return { reply: 'second', stderr: '', exitCode: 0 };
      },
    });
    const baseUrl = await listen(server);
    try {
      const first = fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'first' }),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const second = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'second' }),
      });

      assert.equal(second.status, 429);
      const body = (await second.json()) as { error: string };
      assert.equal(body.error, 'too_many_requests');

      firstResolve!();
      await first;
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_después_de_exceder_rate_limit', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({ reply: 'ok', stderr: '', exitCode: 0 }),
    });
    const baseUrl = await listen(server);
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `test ${i}` }),
        });
        assert.equal(res.status, 200);
        await res.text();
      }

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'over limit' }),
      });
      assert.equal(res.status, 429);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'rate_limit_exceeded');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_renderizar_markdown_en_la_respuesta_done', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({
        reply: '## Título\n\n**negrita** y *cursiva*',
        stderr: '',
        exitCode: 0,
      }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test markdown' }),
      });
      const text = await res.text();
      const doneEvent = text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice('data: '.length)) as {
          type: string;
          reply?: string;
          markdown?: string;
        })
        .find((event) => event.type === 'done');

      assert.ok(doneEvent, 'Should have a done event');
      assert.equal(doneEvent?.reply, '## Título\n\n**negrita** y *cursiva*');
      assert.match(doneEvent?.markdown ?? '', /<h2>Título<\/h2>/);
      assert.match(doneEvent?.markdown ?? '', /<strong>negrita<\/strong>/);
      assert.match(doneEvent?.markdown ?? '', /<em>cursiva<\/em>/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_emitir_error_SSE_cuando_cursor_agent_falla_con_exitCode_1', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({
        reply: '',
        stderr: 'Error line 1\nError line 2\nWorkspace Trust Required\n.../workspace\nPass --trust, --yolo, or -f if you trust this directory',
        exitCode: 1,
      }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test error' }),
      });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /"type":"error"/);
      assert.match(text, /cursor-agent exited with code 1/);
      assert.match(text, /Workspace Trust Required/);
      assert.doesNotMatch(text, /"type":"done"/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_emitir_error_SSE_cuando_reply_está_vacío', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      runChatTurn: async () => ({
        reply: '   ',
        stderr: 'Some warning\nAnother warning',
        exitCode: 0,
      }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test empty reply' }),
      });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /"type":"error"/);
      assert.match(text, /cursor-agent returned an empty reply/);
      assert.doesNotMatch(text, /"type":"done"/);
    } finally {
      await closeServer(server);
    }
  });
});

describe('dashboard token authentication', () => {
  let tmpRoot = '';

  before(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-dash-token-'));
    await mkdir(path.join(tmpRoot, 'logs'), { recursive: true });
  });

  after(async () => {
    if (tmpRoot !== '') {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('debería_rechazar_POST_/api/chat_sin_token_con_401', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      dashboardToken: 'test-token',
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res.status, 401);
      const json = await res.json() as { error: string; message: string };
      assert.equal(json.error, 'unauthorized');
      assert.match(json.message, /Missing or invalid dashboard token/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_aceptar_POST_/api/chat_con_X-Dashboard-Token_válido', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      dashboardToken: 'test-token',
      runChatTurn: async () => ({
        reply: 'Test reply',
        stderr: '',
        exitCode: 0,
      }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dashboard-Token': 'test-token',
        },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /"type":"done"/);
      assert.match(text, /"reply":"Test reply"/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_aceptar_POST_/api/chat_con_Authorization_Bearer_válido', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      dashboardToken: 'test-token',
      runChatTurn: async () => ({
        reply: 'Test reply',
        stderr: '',
        exitCode: 0,
      }),
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ prompt: 'test' }),
      });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /"type":"done"/);
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_GET_/api/threads_sin_token_con_401', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      dashboardToken: 'test-token',
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/threads`);
      assert.equal(res.status, 401);
      const json = await res.json() as { error: string };
      assert.equal(json.error, 'unauthorized');
    } finally {
      await closeServer(server);
    }
  });

  it('debería_rechazar_POST_/api/markdown_sin_token_con_401', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: true,
      dashboardToken: 'test-token',
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '# Test' }),
      });
      assert.equal(res.status, 401);
      const json = await res.json() as { error: string };
      assert.equal(json.error, 'unauthorized');
    } finally {
      await closeServer(server);
    }
  });

  it('GET_/_debería_permanecer_abierto_sin_token', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: false,
      dashboardToken: 'test-token',
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    } finally {
      await closeServer(server);
    }
  });

  it('GET_/api/health_debería_permanecer_abierto_sin_token', async () => {
    const server = createDashboardServer({
      repoRoot: tmpRoot,
      chatEnabled: false,
      dashboardToken: 'test-token',
    });
    const baseUrl = await listen(server);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean };
      assert.equal(json.ok, true);
    } finally {
      await closeServer(server);
    }
  });
});

/** Extrae el texto de los eventos SSE `delta`, en orden. */
function collectSseDeltas(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as {
      type: string;
      text?: string;
    })
    .filter((event) => event.type === 'delta')
    .map((event) => event.text ?? '');
}

async function listen(
  server: ReturnType<typeof createServer>,
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${String(address.port)}`;
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
