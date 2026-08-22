#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runAgentTurn,
  type AgentTurnResult,
} from '../core/agent-turn.js';
import { withoutSegmentRecaps } from '../core/assistant-delta-stream.js';
import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding } from '../lib/onboarding.js';
import {
  WORKSPACE_PATH_ENV,
  WORKSPACE_DIRECTORY_NAME,
} from '../lib/constants.js';
import {
  setPendingTelegramForce,
  consumePendingTelegramForce,
  cancelPendingTelegramForce,
} from '../core/pending-force.js';
import {
  createTelegramApi,
  requireTelegramBotToken,
  type TelegramApi,
} from './telegram-api.js';
import {
  describeAllowlist,
  describeInboundSender,
  isInboundAllowed,
  requireTelegramAllowlist,
  type TelegramAllowlist,
} from './telegram-allowlist.js';
import { createTelegramLiveReply } from './telegram-live-reply.js';
import {
  extractInboundTextMessages,
  nextUpdateOffset,
  type InboundTelegramText,
} from './telegram-parse.js';

export const DEFAULT_LONG_POLL_TIMEOUT_SECONDS = 25;

export type ProcessInboundFn = (
  inbound: InboundTelegramText,
  onAssistantDelta: (text: string) => void,
  confirmedForce?: boolean,
  workspacePath?: string,
) => Promise<AgentTurnResult>;

export interface TelegramBotOptions {
  readonly repoRoot: string;
  readonly api: TelegramApi;
  /** Required: who may reach `cursor-agent` through this bot. */
  readonly allowlist: TelegramAllowlist;
  /** Injected for tests; defaults to `runAgentTurn` against repoRoot. */
  readonly processInbound?: ProcessInboundFn;
  readonly longPollTimeoutSeconds?: number;
  /** When false, run a single getUpdates cycle then stop (tests). */
  readonly loop?: boolean;
  /** Starting offset for getUpdates. */
  readonly initialOffset?: number;
  /** Abort signal to stop the long-poll loop cleanly. */
  readonly signal?: AbortSignal;
}

/**
 * Detects Telegram slash commands that should not spawn agent turns.
 * Matches /start, /help, /stop, /ok, /no with optional @BotName suffix.
 */
function isSlashCommand(text: string): boolean {
  return /^\/(start|help|stop|ok|no)(@\w+)?$/i.test(text.trim());
}

/**
 * Returns a canned reply for slash commands, asking the user to send a real prompt.
 */
function getSlashCommandReply(command: string): string {
  const lower = command.toLowerCase().trim();
  if (lower.startsWith('/ok')) {
    return 'No pending build confirmation found (it may have expired). Please send your build request again.';
  }
  if (lower.startsWith('/no')) {
    return 'No pending confirmation to cancel. Send a build request to get started.';
  }
  return 'Por favor, envía un prompt real, por ejemplo: "qué hace este repo" / Please send a real prompt, e.g. "what does this repo do"';
}

/**
 * Resolves the workspace path for a Telegram chat.
 * Honors WORKSPACE_PATH env the same way resolveWorkspacePath does,
 * then appends telegram/<chatId>/ for per-chat isolation.
 */
function resolveTelegramWorkspace(repoRoot: string, chatId: number, env: NodeJS.ProcessEnv = process.env): string {
  const envPath = env[WORKSPACE_PATH_ENV];
  const baseWorkspace = envPath !== undefined && envPath.trim() !== ''
    ? (path.isAbsolute(envPath) ? envPath : path.resolve(repoRoot, envPath))
    : path.join(repoRoot, WORKSPACE_DIRECTORY_NAME);
  
  return path.join(baseWorkspace, 'telegram', String(chatId));
}

/**
 * Handles one inbound text: runs the shared agent pipeline and replies in chat.
 * The allowlist is enforced here, right next to the call that reaches
 * `cursor-agent`, so no caller can route around it.
 */
export async function dispatchInboundMessage(params: {
  readonly inbound: InboundTelegramText;
  readonly api: TelegramApi;
  readonly allowlist: TelegramAllowlist;
  readonly processInbound: ProcessInboundFn;
}): Promise<void> {
  const { inbound, api, processInbound } = params;

  if (!isInboundAllowed(inbound, params.allowlist)) {
    // Stay silent towards the sender: no reply, no hint that the bot is live.
    console.error(
      `[telegram] Ignored message from ${describeInboundSender(inbound)} (not in allowlist)`,
    );
    return;
  }

  if (isSlashCommand(inbound.text)) {
    const who = inbound.fromUsername ?? String(inbound.chatId);
    const lower = inbound.text.toLowerCase().trim();
    
    // Handle /ok confirmation
    if (lower.startsWith('/ok')) {
      const pendingPrompt = consumePendingTelegramForce(inbound.chatId);
      if (pendingPrompt === undefined) {
        console.error(
          `[telegram] /ok from ${who} chat=${String(inbound.chatId)} but no pending confirmation`,
        );
        await api.sendMessage({
          chatId: inbound.chatId,
          text: getSlashCommandReply('/ok'),
        });
        return;
      }
      
      // Re-run the original prompt with confirmedForce
      console.error(
        `[telegram] Confirmed build from ${who} chat=${String(inbound.chatId)}: ${truncate(pendingPrompt, 80)}`,
      );
      
      const liveReply = createTelegramLiveReply({ api, chatId: inbound.chatId });
      const workspacePath = resolveTelegramWorkspace(params.allowlist.repoRoot ?? '', inbound.chatId);
      console.error(`[telegram] Using per-chat workspace: ${workspacePath}`);
      
      let result: AgentTurnResult;
      try {
        result = await params.processInbound(
          { ...inbound, text: pendingPrompt },
          withoutSegmentRecaps((text) => {
            liveReply.pushDelta(text);
          }),
          true,
          workspacePath,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[telegram] Agent turn failed: ${message}`);
        await liveReply.finish(`Error running agent: ${message}`);
        return;
      }
      
      if (result.stderr.trim() !== '') {
        console.error(result.stderr.trimEnd());
      }
      if (result.exitCode !== 0) {
        console.error(
          `[telegram] cursor-agent exited with code ${String(result.exitCode)}`,
        );
      }
      
      const reply =
        result.reply.trim() !== ''
          ? result.reply
          : `(agent produced empty reply; exit=${String(result.exitCode)})`;
      
      await liveReply.finish(reply);
      console.error(
        `[telegram] Replied to chat=${String(inbound.chatId)} (${String(reply.length)} chars)`,
      );
      return;
    }
    
    // Handle /no cancellation
    if (lower.startsWith('/no')) {
      cancelPendingTelegramForce(inbound.chatId);
      console.error(
        `[telegram] Cancelled pending build from ${who} chat=${String(inbound.chatId)}`,
      );
      await api.sendMessage({
        chatId: inbound.chatId,
        text: 'Build confirmation cancelled. You can send a new request.',
      });
      return;
    }
    
    // Handle other slash commands
    console.error(
      `[telegram] Slash command from ${who} chat=${String(inbound.chatId)}: ${truncate(inbound.text, 80)}`,
    );
    await api.sendMessage({
      chatId: inbound.chatId,
      text: getSlashCommandReply(inbound.text),
    });
    return;
  }

  const who = inbound.fromUsername ?? String(inbound.chatId);
  console.error(
    `[telegram] Message from ${who} chat=${String(inbound.chatId)}: ${truncate(inbound.text, 80)}`,
  );

  const liveReply = createTelegramLiveReply({ api, chatId: inbound.chatId });
  const workspacePath = resolveTelegramWorkspace(params.allowlist.repoRoot ?? '', inbound.chatId);

  let result: AgentTurnResult;
  try {
    result = await processInbound(
      inbound,
      withoutSegmentRecaps((text) => {
        liveReply.pushDelta(text);
      }),
      false,
      workspacePath,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] Agent turn failed: ${message}`);
    await liveReply.finish(`Error running agent: ${message}`);
    return;
  }
  
  // If the result requires force confirmation, store the pending prompt
  if (result.requiresForceConfirmation === true) {
    setPendingTelegramForce(inbound.chatId, inbound.text);
    console.error(`[telegram] Stored pending build confirmation for chat=${String(inbound.chatId)}`);
  }

  if (result.stderr.trim() !== '') {
    console.error(result.stderr.trimEnd());
  }
  if (result.exitCode !== 0) {
    console.error(
      `[telegram] cursor-agent exited with code ${String(result.exitCode)}`,
    );
  }

  const reply =
    result.reply.trim() !== ''
      ? result.reply
      : `(agent produced empty reply; exit=${String(result.exitCode)})`;

  await liveReply.finish(reply);
  console.error(
    `[telegram] Replied to chat=${String(inbound.chatId)} (${String(reply.length)} chars)`,
  );
}

/**
 * Long-polls Telegram getUpdates and dispatches each text message through the
 * same skills+memory+cursor-agent pipeline as `npm run agent`.
 */
export async function runTelegramBot(options: TelegramBotOptions): Promise<void> {
  const timeout =
    options.longPollTimeoutSeconds ?? DEFAULT_LONG_POLL_TIMEOUT_SECONDS;
  const loop = options.loop !== false;
  // Default processInbound uses safeMode (repoRoot cwd, --trust, no --force without confirmation),
  // same as dashboard chat (/api/chat). Tests inject their own processInbound.
  const processInbound =
    options.processInbound ??
    (async (inbound, onAssistantDelta, confirmedForce, workspacePath) =>
      runAgentTurn({
        repoRoot: options.repoRoot,
        userPrompt: inbound.text,
        stream: true,
        safeMode: true,
        ...(confirmedForce !== undefined ? { confirmedForce } : {}),
        ...(workspacePath !== undefined ? { workspacePath } : {}),
        onAssistantDelta,
      }));

  let offset = options.initialOffset ?? 0;
  console.error(
    `[telegram] Long polling started (timeout=${String(timeout)}s, allowlist: ${describeAllowlist(options.allowlist)}, safeMode, per-chat workspace). Ctrl+C to stop.`,
  );

  do {
    if (isAborted(options.signal)) {
      break;
    }

    let updates;
    try {
      updates = await options.api.getUpdates({ offset, timeout });
    } catch (error: unknown) {
      if (isAborted(options.signal)) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[telegram] getUpdates error: ${message}`);
      // Brief pause so a hard failure does not spin the CPU.
      await sleep(2000, options.signal);
      if (!loop) {
        throw error;
      }
      continue;
    }

    offset = nextUpdateOffset(updates, offset);
    const inbound = extractInboundTextMessages(updates);
    for (const message of inbound) {
      if (isAborted(options.signal)) {
        break;
      }
      await dispatchInboundMessage({
        inbound: message,
        api: options.api,
        allowlist: options.allowlist,
        processInbound,
      });
    }
  } while (loop && !isAborted(options.signal));

  console.error('[telegram] Stopped.');
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);
  await maybeRunOnboarding({ repoRoot });
  const token = requireTelegramBotToken(process.env);
  const allowlist = requireTelegramAllowlist(process.env, repoRoot);
  const api = createTelegramApi({ token });

  const controller = new AbortController();
  const onStop = (): void => {
    console.error('[telegram] Shutdown signal received…');
    controller.abort();
  };
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);

  await runTelegramBot({
    repoRoot,
    api,
    allowlist,
    signal: controller.signal,
  });
}

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../..');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (isAborted(signal)) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] ${message}`);
    process.exitCode = 1;
  });
}
