#!/usr/bin/env node
import { resolve } from 'node:path';

import { runMultiAgentHarness } from '../orchestration/multi-agent-harness.js';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.includes('--sequence') ? 'sequence' : 'parallel';

  const exampleTasks = [
    {
      ref: 'coder',
      role: 'Coder',
      prompt: 'Write a simple function to add two numbers and save it to workspace/add.js',
    },
    {
      ref: 'reviewer',
      role: 'Reviewer',
      prompt: 'Review the code in workspace/add.js and suggest improvements',
    },
  ];

  console.log(`Starting multi-agent harness (mode: ${mode})...`);
  console.log(`Tasks: ${exampleTasks.map((t) => t.ref).join(', ')}\n`);

  const result = await runMultiAgentHarness({
    tasks: exampleTasks,
    repoRoot: REPO_ROOT,
    mode,
    defaultRetries: 1,
  });

  console.log('\n' + result.summary);
  console.log(`\nTotal time: ${String(result.totalMs)}ms`);

  const allSuccess = result.workers.every((w) => w.success);
  process.exitCode = allSuccess ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Harness error:', error);
  process.exit(1);
});
