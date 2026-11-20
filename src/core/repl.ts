import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { runAgentTurn, type AgentTurnResult } from './agent-turn.js';
import { withoutSegmentRecaps } from './assistant-delta-stream.js';
import {
  createStdoutLiveReply,
  type StdoutLiveReply,
} from './stdout-live-reply.js';
import {
  listThreads,
  deleteThread,
} from '../lib/threads-store.js';
import { loadAllSkills } from '../loaders/skills-loader.js';
import { parseSlashCommand, buildHelpMessage } from '../lib/mentions/index.js';
import {
  cancelPendingReplLaunch,
  consumePendingReplLaunch,
  formatLaunchResult,
  hasPendingReplLaunch,
  isCancelCommand,
  isConfirmCommand,
  launchConfirmedTask,
  setPendingReplLaunch,
} from '../lib/panal/index.js';
import { isWriteEnvEnabled, targetThreadId } from '../lib/target-thread.js';

export interface ReplOptions {
  readonly debug?: boolean;
  readonly attachments?: readonly string[];
  readonly write?: boolean;
  readonly targetDir?: string;
}

/**
 * Prints available slash commands and skills to stderr.
 */
async function printHelp(repoRoot: string): Promise<void> {
  const skills = await loadAllSkills(repoRoot);
  const helpMessage = buildHelpMessage(skills);
  console.error('\n' + helpMessage);
}

/**
 * Prints thread list to stderr.
 */
async function printThreads(repoRoot: string, currentThreadId: string): Promise<void> {
  const threads = await listThreads(repoRoot);
  if (threads.length === 0) {
    console.error('\nNo threads found.');
    return;
  }
  console.error('\n# Threads\n');
  for (const thread of threads) {
    const indicator = thread.id === currentThreadId ? ' (current)' : '';
    console.error(
      `- ${thread.id}: "${thread.title}" (${String(thread.messageCount)} messages)${indicator}`,
    );
  }
  console.error('');
}

/**
 * Runs interactive REPL mode. Each turn uses the full `runAgentTurn` pipeline
 * (skills + memory + attachments + @ mentions + slash commands) just like one-shot.
 * 
 * Thread persistence: All REPL sessions share a single thread (CLI_THREAD_ID).
 * This thread persists across restarts and maintains conversation history.
 * 
 * Local slash commands (handled before agent):
 * - /help — Show available commands and skills
 * - /clear — Clear current thread history
 * - /threads — List all threads
 * - /attach <path> — Add file(s) to session attachments
 * - /detach — Clear session attachments
 * - exit, .exit, /exit — Quit REPL
 * 
 * Attachments: Initial attachments from --attach flags + any /attach commands
 * are passed to every subsequent turn.
 */
export async function runRepl(
  repoRoot: string,
  options: ReplOptions = {},
): Promise<void> {
  const debug = options.debug === true;
  const sessionAttachments: string[] = [...(options.attachments ?? [])];
  let writeEnabled = options.write === true || isWriteEnvEnabled();
  let targetDir = options.targetDir;
  let threadId = targetThreadId(targetDir);

  console.error('[agent] Starting interactive mode...');
  console.error(`[agent] Thread: ${threadId} (persists across sessions)`);
  console.error(
    `[agent] Writes: ${writeEnabled ? 'ON (--force)' : 'OFF (read-only / --mode ask)'}. /write to enable, /ask to disable.`,
  );
  if (targetDir !== undefined) {
    console.error(`[agent] Target: ${targetDir}`);
  }
  console.error('[agent] Type /help for commands, exit to quit');
  if (sessionAttachments.length > 0) {
    console.error(`[agent] Initial attachments: ${sessionAttachments.join(', ')}`);
  }

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const userInput = await rl.question('prompt> ');
      const trimmed = userInput.trim();

      if (!trimmed) continue;

      // Handle exit commands
      if (trimmed === 'exit' || trimmed === '.exit' || trimmed === '/exit') {
        console.error('[agent] Goodbye!');
        break;
      }

      // Check if this is a local slash command (not passed to agent)
      const skills = await loadAllSkills(repoRoot);
      const slashCommand = parseSlashCommand(trimmed, skills);

      if (slashCommand?.isBuiltIn === true) {
        if (slashCommand.command === 'help') {
          await printHelp(repoRoot);
          continue;
        }

        if (slashCommand.command === 'clear') {
          const deleted = await deleteThread(repoRoot, threadId);
          if (deleted) {
            console.error(`[agent] Thread ${threadId} cleared. Starting fresh.`);
          } else {
            console.error(`[agent] Thread ${threadId} was already empty or didn't exist.`);
          }
          continue;
        }

        if (slashCommand.command === 'write') {
          writeEnabled = true;
          console.error('[agent] Writes enabled for this session (--force).');
          continue;
        }

        if (slashCommand.command === 'ask') {
          writeEnabled = false;
          console.error('[agent] Writes disabled. Using read-only --mode ask.');
          continue;
        }

        if (slashCommand.command === 'target') {
          const next = slashCommand.args.trim();
          if (next === '') {
            console.error('[agent] /target requires a directory');
            continue;
          }
          const resolved = path.isAbsolute(next) ? next : path.resolve(process.cwd(), next);
          if (!existsSync(resolved)) {
            console.error(`[agent] Target not found: ${resolved}`);
            continue;
          }
          targetDir = resolved;
          threadId = targetThreadId(targetDir);
          console.error(`[agent] Target: ${targetDir}`);
          console.error(`[agent] Thread: ${threadId}`);
          continue;
        }

        if (isConfirmCommand(trimmed) && hasPendingReplLaunch(threadId)) {
          const pending = consumePendingReplLaunch(threadId);
          if (pending === undefined) {
            console.error('[agent] No pending launch (it may have expired).');
            continue;
          }
          console.error('[agent] Launching confirmed panal/Claude task…');
          try {
            const launched = await launchConfirmedTask(pending.proposal);
            console.log(formatLaunchResult(launched));
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[agent] Launch failed: ${message}`);
          }
          continue;
        }

        if (isCancelCommand(trimmed) && hasPendingReplLaunch(threadId)) {
          cancelPendingReplLaunch(threadId);
          console.error('[agent] Launch cancelled.');
          continue;
        }

        if (slashCommand.command === 'threads') {
          await printThreads(repoRoot, threadId);
          continue;
        }

        if (slashCommand.command === 'attach') {
          const result = handleAttachCommand(slashCommand.args, repoRoot, sessionAttachments);
          console.error(result.message);
          continue;
        }

        if (slashCommand.command === 'detach') {
          sessionAttachments.length = 0;
          console.error('[agent] Session attachments cleared / Adjuntos de sesión limpiados');
          continue;
        }
      }

      // Not a local command, pass to agent via runAgentTurn
      const liveReply = createStdoutLiveReply();
      try {
        const result = await runAgentTurn({
          repoRoot,
          userPrompt: trimmed,
          debug,
          threadId,
          write: writeEnabled,
          stream: true,
          ...(targetDir !== undefined ? { targetDir } : {}),
          ...(sessionAttachments.length > 0 ? { attachments: sessionAttachments } : {}),
          onAssistantDelta: withoutSegmentRecaps((text) => {
            liveReply.pushDelta(text);
          }),
        });

        if (result.requiresLaunchConfirmation === true && result.launchProposal !== undefined) {
          setPendingReplLaunch(threadId, result.launchProposal, threadId);
        }

        writeAgentResult(result, liveReply);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent] Error: ${message}`);
      }
    }
  } finally {
    rl.close();
  }
}

/**
 * Handles /attach command: validates and adds path(s) to session attachments.
 * Resolves paths relative to process.cwd() (like CLI one-shot mode).
 */
function handleAttachCommand(
  args: string,
  _repoRoot: string,
  sessionAttachments: string[],
): { message: string } {
  const paths = args.trim().split(/\s+/).filter((p) => p !== '');
  
  if (paths.length === 0) {
    return {
      message: '[agent] /attach requires at least one path / /attach requiere al menos una ruta',
    };
  }

  const added: string[] = [];
  const missing: string[] = [];

  for (const rawPath of paths) {
    const resolved = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(process.cwd(), rawPath);

    if (!existsSync(resolved)) {
      missing.push(rawPath);
      continue;
    }

    if (!sessionAttachments.includes(resolved)) {
      sessionAttachments.push(resolved);
      added.push(resolved);
    }
  }

  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`[agent] Added ${String(added.length)} file(s) / Añadido ${String(added.length)} archivo(s):`);
    parts.push(...added.map((p) => `  - ${p}`));
  }
  if (missing.length > 0) {
    parts.push(`[agent] ⚠️  File(s) not found / Archivo(s) no encontrado(s):`);
    parts.push(...missing.map((p) => `  - ${p}`));
  }
  if (added.length === 0 && missing.length === 0) {
    parts.push('[agent] No new attachments / Sin nuevos adjuntos');
  }

  return { message: parts.join('\n') };
}

/**
 * Writes agent result to stdout/stderr, handling exit codes and live reply finalization.
 */
function writeAgentResult(
  result: AgentTurnResult,
  liveReply: StdoutLiveReply,
): void {
  if (result.stderr.trim() !== '') {
    console.error(result.stderr.trimEnd());
  }

  if (result.exitCode !== 0) {
    console.error(
      `[agent] cursor-agent exited with code ${String(result.exitCode)}`,
    );
  }

  liveReply.finish(result.reply);
}
