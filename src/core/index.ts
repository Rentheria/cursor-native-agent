#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding, ensureDefaultConfig } from '../lib/onboarding.js';
import {
  isDebugEnabled,
  runAgentTurn,
  type AgentTurnResult,
} from './agent-turn.js';
import { withoutSegmentRecaps } from './assistant-delta-stream.js';
import { stripDebugFlags } from './debug.js';
import {
  createStdoutLiveReply,
  type StdoutLiveReply,
} from './stdout-live-reply.js';

function showHelp(): void {
  console.log(`
cursor-native-agent CLI

Run the Cursor-native agent with skills + memory orchestration.

Usage:
  npm run agent -- "<prompt>"              Run one-shot agent turn
  npm run agent -- --interactive           Start interactive REPL
  npm run agent -- -i                      Alias for --interactive
  npm run agent -- --debug "<prompt>"      Run with debug output
  npm run agent -- --attach <file> "<prompt>"  Attach file(s) to prompt
  npm run agent -- --help                  Show this help
  npm run agent -- -h                      Alias for --help

Flags:
  --interactive, -i   Interactive REPL mode (maintains thread history across sessions)
  --debug             Enable debug logging
  --yes, -y           Skip onboarding prompts (use defaults)
  --attach <file>     Attach file(s) to the prompt (can be used multiple times)
  --help, -h          Show this help

@ Mentions (Cursor IDE-style):
  Reference files and folders directly in your prompt:
  • @src/foo.ts                Include file content
  • @folder/                   List directory contents
  • @./relative/path.txt       Relative paths work too

/ Commands (Slash commands):
  Built-in commands (handled locally, no model call):
  • /help                      Show available commands and skills
  • /clear                     Clear thread history (start fresh conversation)
  • /threads                   List all threads
  • exit, .exit, /exit         Quit interactive mode

  Skill commands (passed to model with specific skill loaded):
  • /skill-name <args>         Run a specific skill (e.g., /git-commit, /summarize-file)

File Attachments:
  • PDFs: Converted to markdown with Microsoft MarkItDown (saves tokens vs raw text)
  • Images: Passed through to cursor-agent (best effort image support)
  • Text files: Included with size caps (50KB default)
  • Binary files: Skipped with a note

  Requires MarkItDown for PDFs: pip install markitdown[pdf]
  
  In interactive mode: --attach flags apply to all turns in the session

Build Execution Modes / Modos de ejecución de builds:
  • CLI one-shot (terminal):
    → Builds run with --force immediately (direct)
    → Always uses --trust for cursor-agent tooling
  • CLI interactive (REPL):
    → Same as one-shot: builds run with --force immediately
    → Maintains thread history across sessions (thread ID: cli-repl)
    → All turns use full pipeline: skills + memory + attachments + @ mentions
  • Dashboard/Telegram (safeMode):
    → Builds require user confirmation: Confirmar/Cancelar (or /ok /no)
    → --force applied only after explicit confirmation
    → Always uses --trust for cursor-agent tooling

Examples:
  npm run agent -- "summarize MEMORY.md"
  npm run agent -- "@src/core/agent-turn.ts explain this file"
  npm run agent -- "/git-commit for the recent changes"
  npm run agent -- --attach report.pdf "summarize this PDF"
  npm run agent -- "@data.csv compare with @report.pdf"
  npm run agent -- "/help"
  npm run agent -- -i                          # Start interactive mode
  npm run agent -- -i --attach doc.pdf         # Interactive with attachment
`);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);

  const rawArgs = process.argv.slice(2);
  
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    showHelp();
    return;
  }

  const debug = isDebugEnabled(rawArgs);
  const args = stripDebugFlags(rawArgs);

  const isInteractive = args.includes('--interactive') || args.includes('-i');
  
  const attachments: string[] = [];
  const filteredArgs: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--attach' && i + 1 < args.length) {
      i += 1;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        attachments.push(nextArg);
      }
      i += 1;
    } else if (arg !== '-i' && arg !== '--interactive' && arg !== undefined) {
      filteredArgs.push(arg);
      i += 1;
    } else {
      i += 1;
    }
  }
  
  const isOneShotWithPrompt = filteredArgs.length > 0 && !isInteractive;

  if (isOneShotWithPrompt) {
    ensureDefaultConfig(repoRoot);
  } else {
    await maybeRunOnboarding({ repoRoot });
  }

  if (isInteractive) {
    const { runRepl } = await import('./repl.js');
    await runRepl(repoRoot, { 
      debug,
      ...(attachments.length > 0 ? { attachments } : {}),
    });
    return;
  }

  const userPrompt = await readUserPrompt(filteredArgs);

  if (userPrompt.trim() === '') {
    throw new Error(
      'Empty prompt. Usage: npm run agent -- [--debug] [--attach <file>] "<prompt>"',
    );
  }

  const liveReply = createStdoutLiveReply();
  const result = await runAgentTurn({
    repoRoot,
    userPrompt,
    debug,
    stream: true,
    ...(attachments.length > 0 ? { attachments } : {}),
    onAssistantDelta: withoutSegmentRecaps((text) => {
      liveReply.pushDelta(text);
    }),
  });
  writeAgentResult(result, liveReply);
}

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
    process.exitCode = result.exitCode;
  }

  liveReply.finish(result.reply);
}

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../..');
}

async function readUserPrompt(argv: readonly string[]): Promise<string> {
  if (argv.length > 0) {
    return argv.join(' ').trim();
  }

  if (input.isTTY) {
    const rl = createInterface({ input, output });
    try {
      return (await rl.question('prompt> ')).trim();
    } finally {
      rl.close();
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent] ${message}`);
  process.exitCode = 1;
});
