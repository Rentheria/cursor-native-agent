import { accessSync, constants as fsConstants, existsSync } from 'node:fs';
import path from 'node:path';

import {
  CURSOR_AGENT_BINARY,
  CURSOR_AGENT_BIN_PATH_ENV,
} from './constants.js';

export { CURSOR_AGENT_BIN_PATH_ENV } from './constants.js';

/**
 * Resolves which binary to spawn for `cursor-agent`.
 *
 * Order (simple + reliable for ENOENT from missing PATH entries):
 * 1. `CURSOR_AGENT_BIN_PATH` if set — explicit absolute path wins.
 * 2. Common install locations (`~/.local/bin/cursor-agent`, …) when executable.
 * 3. Bare `cursor-agent` — rely on the process PATH (normal interactive shells).
 */
export function resolveCursorAgentBinary(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env[CURSOR_AGENT_BIN_PATH_ENV]?.trim();
  if (override !== undefined && override !== '') {
    return override;
  }

  for (const candidate of commonCursorAgentPaths(env)) {
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return CURSOR_AGENT_BINARY;
}

/** User-facing spawn failure that mentions PATH and the override env var. */
export function formatCursorAgentSpawnError(
  binary: string,
  causeMessage: string,
): string {
  return (
    `Failed to spawn ${binary}: ${causeMessage}. ` +
    `Is cursor-agent on PATH? Or set ${CURSOR_AGENT_BIN_PATH_ENV} to the absolute path of the binary.`
  );
}

export function commonCursorAgentPaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const paths: string[] = [];
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (home !== undefined && home !== '') {
    paths.push(path.join(home, '.local', 'bin', 'cursor-agent'));
    paths.push(path.join(home, '.npm-global', 'bin', 'cursor-agent'));
    paths.push(path.join(home, 'n', 'bin', 'cursor-agent'));
  }
  paths.push('/usr/local/bin/cursor-agent');
  return paths;
}

function isExecutableFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
