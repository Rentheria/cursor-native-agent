import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding } from '../lib/onboarding.js';

async function main(): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  loadRepoEnv(repoRoot);
  await maybeRunOnboarding({ repoRoot, skipOnboarding: false });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[onboard] ${message}`);
  process.exitCode = 1;
});
