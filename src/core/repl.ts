import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
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

export interface ReplOptions {
  readonly debug?: boolean;
  readonly attachments?: readonly string[];
}

/**
 * CLI thread ID constant - all REPL sessions share this thread.
 */
const CLI_THREAD_ID = 'cli-repl';

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
async function printThreads(repoRoot: string): Promise<void> {
  const threads = await listThreads(repoRoot);
  if (threads.length === 0) {
    console.error('\nNo threads found.');
    return;
  }
  console.error('\n# Threads\n');
  for (const thread of threads) {
    const indicator = thread.id === CLI_THREAD_ID ? ' (current)' : '';
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
 * - exit, .exit, /exit — Quit REPL
 * 
 * Attachments: Initial attachments from --attach flags are passed to every turn.
 * Mid-session /attach is not yet implemented (tracked as future enhancement).
 */
export async function runRepl(
  repoRoot: string,
  options: ReplOptions = {},
): Promise<void> {
  const debug = options.debug === true;
  const initialAttachments = options.attachments ?? [];

  console.error('[agent] Starting interactive mode...');
  console.error(`[agent] Thread: ${CLI_THREAD_ID} (persists across sessions)`);
  console.error('[agent] Type /help for commands, exit to quit');

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
          const deleted = await deleteThread(repoRoot, CLI_THREAD_ID);
          if (deleted) {
            console.error(`[agent] Thread ${CLI_THREAD_ID} cleared. Starting fresh.`);
          } else {
            console.error(`[agent] Thread ${CLI_THREAD_ID} was already empty or didn't exist.`);
          }
          continue;
        }

        if (slashCommand.command === 'threads') {
          await printThreads(repoRoot);
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
          threadId: CLI_THREAD_ID,
          stream: true,
          ...(initialAttachments.length > 0 ? { attachments: initialAttachments } : {}),
          onAssistantDelta: withoutSegmentRecaps((text) => {
            liveReply.pushDelta(text);
          }),
        });

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
