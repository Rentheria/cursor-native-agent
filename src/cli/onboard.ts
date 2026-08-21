import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding } from '../lib/onboarding.js';

function showHelp(): void {
  console.log(`
cursor-native-agent onboarding

Configures .env with default settings (Auto) or custom values (Personalizado).

Usage:
  npm run onboard           Run interactive onboarding (TTY only)
  npm run onboard -- --yes  Use Auto defaults without prompting
  npm run onboard -- -y     Alias for --yes
  npm run onboard -- --help Show this help
  npm run onboard -- -h     Alias for --help

Skip rules:
  - CURSOR_NATIVE_AGENT_SKIP_ONBOARD=1 environment variable
  - CURSOR_NATIVE_AGENT_ONBOARDED=1 already in .env
  - CI=true or CI=1 environment variable
  - Non-TTY input (defaults used automatically)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

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
