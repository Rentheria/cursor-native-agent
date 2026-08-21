import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runAgentTurn,
  type AgentTurnResult,
} from '../core/agent-turn.js';
import { withoutSegmentRecaps } from '../core/assistant-delta-stream.js';
import { AGENT_NDJSON_RELATIVE_PATH } from '../core/debug.js';
import { MEMORY_INDEX_FILE_NAME } from '../lib/constants.js';
import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding } from '../lib/onboarding.js';
import { renderDashboardHtml, type DashboardSnapshot } from './html.js';
import { renderMarkdown } from './markdown.js';
import {
  parseAgentNdjson,
  parseCronFindings,
  parseMemoryIndex,
} from './parse-logs.js';

export const DEFAULT_DASHBOARD_PORT = 3847;
export const CRON_LOG_RELATIVE_PATH = 'logs/cron.log';
export const DASHBOARD_CHAT_ENV = 'CURSOR_NATIVE_AGENT_DASHBOARD_CHAT';
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 10;

export type ChatTurnRunner = (options: {
  readonly repoRoot: string;
  readonly userPrompt: string;
  readonly onAssistantDelta?: (text: string) => void;
}) => Promise<AgentTurnResult>;

type RateLimitEntry = {
  readonly timestamps: number[];
};

export type DashboardServerOptions = {
  readonly repoRoot: string;
  readonly agentLimit?: number;
  readonly cronLimit?: number;
  /**
   * Override for tests. When omitted, reads
   * `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT` (default on; disable with 0/false/off).
   */
  readonly chatEnabled?: boolean;
  /** Injected for tests; defaults to streaming `runAgentTurn`. */
  readonly runChatTurn?: ChatTurnRunner;
  /** Override listen port for origin checks (tests only). */
  readonly listenPort?: number;
};

const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

let chatInFlight = false;

/**
 * True when dashboard chat is enabled. Enabled by default for local use;
 * explicitly set to '0', 'false', or 'off' to disable.
 */
export function isDashboardChatEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env[DASHBOARD_CHAT_ENV];
  if (flag === undefined) {
    return true;
  }
  return flag !== '0' && flag !== 'false' && flag !== 'off';
}

/** Resolves listen port from `PORT` env (default 3847). */
export function resolveDashboardPort(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env['PORT'];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_DASHBOARD_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `Invalid PORT="${raw}". Expected an integer 1–65535 (default ${String(DEFAULT_DASHBOARD_PORT)}).`,
    );
  }
  return parsed;
}

/** Loads snapshot from disk (read-only). Missing files → empty sections. */
export async function loadDashboardSnapshot(
  options: DashboardServerOptions,
): Promise<DashboardSnapshot> {
  const agentLimit = options.agentLimit ?? 20;
  const cronLimit = options.cronLimit ?? 10;
  const agentPath = path.join(options.repoRoot, AGENT_NDJSON_RELATIVE_PATH);
  const cronPath = path.join(options.repoRoot, CRON_LOG_RELATIVE_PATH);
  const memoryPath = path.join(options.repoRoot, MEMORY_INDEX_FILE_NAME);
  const chatEnabled = resolveChatEnabled(options);

  const [agentRaw, cronRaw, memoryRaw] = await Promise.all([
    readFileOptional(agentPath),
    readFileOptional(cronPath),
    readFileOptional(memoryPath),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    agentTurns: parseAgentNdjson(agentRaw, agentLimit),
    cronFindings: parseCronFindings(cronRaw, cronLimit),
    memoryEntries: parseMemoryIndex(memoryRaw),
    memoryRaw,
    sources: {
      agentPath: AGENT_NDJSON_RELATIVE_PATH,
      cronPath: CRON_LOG_RELATIVE_PATH,
      memoryPath: MEMORY_INDEX_FILE_NAME,
    },
    ...(chatEnabled ? { chatEnabled: true as const } : {}),
  };
}

/**
 * Creates an HTTP server for local observability.
 * Read-only by default; POST /api/chat only when chat opt-in is enabled.
 */
export function createDashboardServer(options: DashboardServerOptions): Server {
  const rateLimitMap = new Map<string, RateLimitEntry>();
  const server = createServer((req, res) => {
    void handleRequest(req, res, options, rateLimitMap, server);
  });
  return server;
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardServerOptions,
  rateLimitMap: Map<string, RateLimitEntry>,
  server: Server,
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;
  const chatEnabled = resolveChatEnabled(options);

  if (pathname === '/api/chat') {
    if (!chatEnabled) {
      sendJson(res, 404, {
        error: 'not_found',
        message: 'Chat is disabled. Remove CURSOR_NATIVE_AGENT_DASHBOARD_CHAT or unset it to enable.',
      }, false, chatEnabled);
      return;
    }
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'method_not_allowed',
        message: 'Use POST /api/chat with JSON body { "prompt": "..." }.',
      }, false, chatEnabled);
      return;
    }
    await handleChatPost(req, res, options, rateLimitMap, server);
    return;
  }

  if (pathname === '/api/markdown') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'method_not_allowed',
        message: 'Use POST /api/markdown with JSON body { "text": "..." }.',
      }, false, chatEnabled);
      return;
    }
    await handleMarkdownPost(req, res);
    return;
  }

  if (!READ_ONLY_METHODS.has(method)) {
    sendJson(res, 405, {
      error: 'method_not_allowed',
      message: 'Dashboard is read-only. Only GET and HEAD are allowed.',
    }, false, chatEnabled);
    return;
  }

  try {
    if (pathname === '/' || pathname === '/index.html') {
      const snapshot = await loadDashboardSnapshot(options);
      const html = renderDashboardHtml(snapshot);
      sendText(res, 200, 'text/html; charset=utf-8', method === 'HEAD' ? '' : html, chatEnabled);
      return;
    }

    if (pathname === '/api/agent') {
      const snapshot = await loadDashboardSnapshot(options);
      sendJson(res, 200, { turns: snapshot.agentTurns }, method === 'HEAD', chatEnabled);
      return;
    }

    if (pathname === '/api/cron') {
      const snapshot = await loadDashboardSnapshot(options);
      sendJson(res, 200, { findings: snapshot.cronFindings }, method === 'HEAD', chatEnabled);
      return;
    }

    if (pathname === '/api/memory') {
      const snapshot = await loadDashboardSnapshot(options);
      sendJson(
        res,
        200,
        {
          entries: snapshot.memoryEntries,
          indexMarkdown: snapshot.memoryRaw,
        },
        method === 'HEAD',
        chatEnabled,
      );
      return;
    }

    if (pathname === '/api/health') {
      sendJson(
        res,
        200,
        {
          ok: true,
          readOnly: !chatEnabled,
          chatEnabled,
        },
        method === 'HEAD',
        chatEnabled,
      );
      return;
    }

    sendJson(res, 404, {
      error: 'not_found',
      message: `No route for ${pathname}`,
    }, false, chatEnabled);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: 'internal_error', message }, false, chatEnabled);
  }
}

async function handleMarkdownPost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 400, { error: 'invalid_json', message });
    return;
  }

  const text = extractMarkdownText(body);
  if (text === undefined) {
    sendJson(res, 400, {
      error: 'invalid_text',
      message: 'Expected JSON body { "text": "<string>" }.',
    });
    return;
  }

  const markdown = renderMarkdown(text);
  sendJson(res, 200, { markdown });
}

async function handleChatPost(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardServerOptions,
  rateLimitMap: Map<string, RateLimitEntry>,
  server: Server,
): Promise<void> {
  const address = server.address();
  const port = typeof address === 'object' && address !== null
    ? address.port
    : (options.listenPort ?? resolveDashboardPort());
  if (!isOriginAllowed(req, port)) {
    sendJson(res, 403, {
      error: 'forbidden',
      message: 'Cross-origin requests are not allowed. POST /api/chat only accepts requests from the local dashboard.',
    });
    return;
  }

  if (chatInFlight) {
    sendJson(res, 429, {
      error: 'too_many_requests',
      message: 'Another chat turn is already in progress. Wait for it to finish before starting a new one.',
    });
    return;
  }

  const clientIp = req.socket.remoteAddress ?? 'unknown';
  if (!checkRateLimit(clientIp, rateLimitMap)) {
    sendJson(res, 429, {
      error: 'rate_limit_exceeded',
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
    });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Body too large')) {
      sendJson(res, 413, { error: 'payload_too_large', message });
    } else {
      sendJson(res, 400, { error: 'invalid_json', message });
    }
    return;
  }

  const prompt = extractChatPrompt(body);
  if (prompt === undefined) {
    sendJson(res, 400, {
      error: 'invalid_prompt',
      message: 'Expected JSON body { "prompt": "<non-empty string>" }.',
    });
    return;
  }

  const runChat = options.runChatTurn ?? defaultChatTurnRunner;
  beginSse(res);

  chatInFlight = true;
  try {
    const result = await runChat({
      repoRoot: options.repoRoot,
      userPrompt: prompt,
      onAssistantDelta: withoutSegmentRecaps((text) => {
        writeSseEvent(res, { type: 'delta', text });
      }),
    });
    
    if (result.exitCode !== 0 || result.reply.trim() === '') {
      const stderrSnippet = result.stderr.trim().split('\n').slice(-3).join('\n');
      const message = result.exitCode !== 0
        ? `cursor-agent exited with code ${result.exitCode}${stderrSnippet ? `: ${stderrSnippet}` : ''}`
        : 'cursor-agent returned an empty reply';
      writeSseEvent(res, { type: 'error', message });
      res.end();
      return;
    }
    
    const markdown = renderMarkdown(result.reply);
    writeSseEvent(res, {
      type: 'done',
      reply: result.reply,
      markdown,
      exitCode: result.exitCode,
    });
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeSseEvent(res, { type: 'error', message });
    res.end();
  } finally {
    chatInFlight = false;
  }
}

async function defaultChatTurnRunner(options: {
  readonly repoRoot: string;
  readonly userPrompt: string;
  readonly onAssistantDelta?: (text: string) => void;
}): Promise<AgentTurnResult> {
  return await runAgentTurn({
    repoRoot: options.repoRoot,
    userPrompt: options.userPrompt,
    stream: true,
    safeMode: true,
    ...(options.onAssistantDelta !== undefined
      ? { onAssistantDelta: options.onAssistantDelta }
      : {}),
  });
}

function resolveChatEnabled(options: DashboardServerOptions): boolean {
  if (options.chatEnabled !== undefined) {
    return options.chatEnabled;
  }
  return isDashboardChatEnabled();
}

function extractChatPrompt(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const prompt = (body as Record<string, unknown>)['prompt'];
  if (typeof prompt !== 'string') {
    return undefined;
  }
  const trimmed = prompt.trim();
  return trimmed === '' ? undefined : trimmed;
}

function extractMarkdownText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const text = (body as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text : undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > MAX_JSON_BODY_BYTES) {
      throw new Error(`Body too large. Maximum allowed: ${MAX_JSON_BODY_BYTES} bytes (256 KiB).`);
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function isOriginAllowed(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  if (origin === undefined && referer === undefined) {
    return true;
  }
  
  const allowedOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  
  if (origin !== undefined) {
    return allowedOrigins.includes(origin);
  }
  
  if (referer !== undefined) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      return allowedOrigins.includes(refererOrigin);
    } catch {
      return false;
    }
  }
  
  return false;
}

function checkRateLimit(clientId: string, rateLimitMap: Map<string, RateLimitEntry>): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientId);
  
  if (entry === undefined) {
    rateLimitMap.set(clientId, { timestamps: [now] });
    return true;
  }
  
  const recentTimestamps = entry.timestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  
  if (recentTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(clientId, { timestamps: recentTimestamps });
  return true;
}

async function readFileOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}

function beginSse(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Dashboard-Mode', 'chat');
  res.flushHeaders?.();
}

function writeSseEvent(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headOnly = false,
  chatEnabled = false,
): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Dashboard-Mode', chatEnabled ? 'chat' : 'read-only');
  if (headOnly) {
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    res.end();
    return;
  }
  res.end(payload);
}

function sendText(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  chatEnabled = false,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Dashboard-Mode', chatEnabled ? 'chat' : 'read-only');
  res.end(body);
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  loadRepoEnv(repoRoot);
  await maybeRunOnboarding({ repoRoot });
  const port = resolveDashboardPort();
  const chatEnabled = isDashboardChatEnabled();
  const server = createDashboardServer({ repoRoot });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.error(
    `[dashboard] observatory at http://127.0.0.1:${String(port)}/`,
  );
  console.error(
    `[dashboard] sources: ${AGENT_NDJSON_RELATIVE_PATH}, ${CRON_LOG_RELATIVE_PATH}, ${MEMORY_INDEX_FILE_NAME}`,
  );
  console.error(
    `[dashboard] chat: ${chatEnabled ? 'ENABLED (POST /api/chat)' : 'off (set CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0 to disable)'}`,
  );
  if (chatEnabled) {
    console.error(
      '[dashboard] chat enabled (POST /api/chat). Runs in safe mode (repoRoot cwd, no force, yes trust). Bind is 127.0.0.1 only.',
    );
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dashboard] ${message}`);
    process.exitCode = 1;
  });
}
