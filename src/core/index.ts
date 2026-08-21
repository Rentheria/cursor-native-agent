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
  npm run agent -- --help                  Show this help
  npm run agent -- -h                      Alias for --help

Flags:
  --interactive, -i   Interactive REPL mode
  --debug             Enable debug logging
  --yes, -y           Skip onboarding prompts (use defaults)
  --help, -h          Show this help

Examples:
  npm run agent -- "summarize MEMORY.md"
  npm run agent -- --interactive
  npm run agent -- --debug "explain error in logs"
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
  const isOneShotWithPrompt = args.length > 0 && !isInteractive;

  if (isOneShotWithPrompt) {
    ensureDefaultConfig(repoRoot);
  } else {
    await maybeRunOnboarding({ repoRoot });
  }

  if (isInteractive) {
    const { runRepl } = await import('./repl.js');
    await runRepl(repoRoot, { debug });
    return;
  }

  const userPrompt = await readUserPrompt(args);

  if (userPrompt.trim() === '') {
    throw new Error(
      'Empty prompt. Usage: npm run agent -- [--debug] "<prompt>"',
    );
  }

  const liveReply = createStdoutLiveReply();
  const result = await runAgentTurn({
    repoRoot,
    userPrompt,
    debug,
    stream: true,
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
