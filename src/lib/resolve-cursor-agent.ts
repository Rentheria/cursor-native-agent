import { accessSync, constants as fsConstants, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  CURSOR_AGENT_BINARY,
  CURSOR_AGENT_BIN_PATH_ENV,
} from './constants.js';

export { CURSOR_AGENT_BIN_PATH_ENV } from './constants.js';

export interface CursorAgentInvocation {
  readonly command: string;
  readonly prefixArgs: string[];
}

/**
 * Resolves how to invoke `cursor-agent` on the current platform.
 * 
 * On Windows, cursor-agent is installed as a .cmd wrapper that cannot be
 * spawned directly without shell:true. Instead, we resolve to the underlying
 * node.exe + index.js.
 * 
 * Order:
 * 1. CURSOR_AGENT_BIN_PATH if set (mapped to node+index on Windows .cmd/.ps1)
 * 2. Common install locations (Windows: %LOCALAPPDATA%\cursor-agent\versions\*)
 * 3. Bare cursor-agent on PATH
 */
export function resolveCursorAgentInvocation(
  env: NodeJS.ProcessEnv = process.env,
): CursorAgentInvocation {
  const override = env[CURSOR_AGENT_BIN_PATH_ENV]?.trim();
  if (override !== undefined && override !== '') {
    if (process.platform === 'win32' && isWindowsWrapper(override)) {
      const resolved = resolveWindowsWrapperToNodeInvocation(override);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return { command: override, prefixArgs: [] };
  }

  for (const candidate of commonCursorAgentPaths(env)) {
    if (process.platform === 'win32' && isWindowsWrapper(candidate)) {
      const resolved = resolveWindowsWrapperToNodeInvocation(candidate);
      if (resolved !== undefined) {
        return resolved;
      }
    } else if (isExecutableFile(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }

  return { command: CURSOR_AGENT_BINARY, prefixArgs: [] };
}

/**
 * Resolves which binary to spawn for `cursor-agent`.
 *
 * Order (simple + reliable for ENOENT from missing PATH entries):
 * 1. `CURSOR_AGENT_BIN_PATH` if set — explicit absolute path wins.
 * 2. Common install locations (`~/.local/bin/cursor-agent`, …) when executable.
 * 3. Bare `cursor-agent` — rely on the process PATH (normal interactive shells).
 * 
 * @deprecated Use resolveCursorAgentInvocation() instead for Windows compatibility
 */
export function resolveCursorAgentBinary(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolveCursorAgentInvocation(env).command;
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
  
  if (process.platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim();
    if (localAppData !== undefined && localAppData !== '') {
      paths.push(path.join(localAppData, 'cursor-agent', 'cursor-agent.cmd'));
      const versionsDir = path.join(localAppData, 'cursor-agent', 'versions');
      if (existsSync(versionsDir)) {
        try {
          const versions = readdirSync(versionsDir);
          for (const version of versions) {
            paths.push(path.join(versionsDir, version, 'cursor-agent.cmd'));
          }
        } catch {
          // Ignore read errors
        }
      }
    }
    if (home !== undefined && home !== '') {
      paths.push(path.join(home, '.npm-global', 'cursor-agent.cmd'));
    }
  } else {
    if (home !== undefined && home !== '') {
      paths.push(path.join(home, '.local', 'bin', 'cursor-agent'));
      paths.push(path.join(home, '.npm-global', 'bin', 'cursor-agent'));
      paths.push(path.join(home, 'n', 'bin', 'cursor-agent'));
    }
    paths.push('/usr/local/bin/cursor-agent');
  }
  
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

function isWindowsWrapper(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.cmd' || ext === '.ps1' || ext === '.bat';
}

/**
 * Resolves a Windows .cmd/.ps1 wrapper to the underlying node.exe + index.js.
 * Expects the typical npm global install structure:
 * %LOCALAPPDATA%\cursor-agent\
 *   cursor-agent.cmd (or versions\<ver>\cursor-agent.cmd)
 *   versions\<ver>\node.exe
 *   versions\<ver>\index.js
 */
function resolveWindowsWrapperToNodeInvocation(
  wrapperPath: string,
): CursorAgentInvocation | undefined {
  const dir = path.dirname(wrapperPath);
  const nodeExe = path.join(dir, 'node.exe');
  const indexJs = path.join(dir, 'index.js');
  
  if (existsSync(nodeExe) && existsSync(indexJs)) {
    return {
      command: nodeExe,
      prefixArgs: [indexJs],
    };
  }
  
  return undefined;
}
