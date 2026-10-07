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

export interface CursorAgentPathFs {
  readonly existsSync: (filePath: string) => boolean;
  readonly readdirSync: (dirPath: string) => string[];
  readonly accessSync?: (filePath: string, mode: number) => void;
}

export interface ResolveCursorAgentOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly fs?: CursorAgentPathFs;
}

const defaultFs: CursorAgentPathFs = {
  existsSync,
  readdirSync: (dirPath) => readdirSync(dirPath),
  accessSync,
};

/**
 * Resolves how to invoke `cursor-agent` on the current platform.
 *
 * On Windows, cursor-agent is installed as a .cmd/.ps1 wrapper that cannot be
 * spawned with `child_process.spawn` (EINVAL). We resolve to the underlying
 * node.exe + index.js of the **newest** installed version.
 *
 * Order:
 * 1. CURSOR_AGENT_BIN_PATH if set (mapped to node+index on Windows wrappers)
 * 2. Common install locations (Windows: %LOCALAPPDATA%\cursor-agent\versions\*)
 * 3. Bare cursor-agent on PATH
 */
export function resolveCursorAgentInvocation(
  envOrOptions: NodeJS.ProcessEnv | ResolveCursorAgentOptions = process.env,
): CursorAgentInvocation {
  const options = isResolveOptions(envOrOptions)
    ? envOrOptions
    : { env: envOrOptions };
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const fs = options.fs ?? defaultFs;

  const override = env[CURSOR_AGENT_BIN_PATH_ENV]?.trim();
  if (override !== undefined && override !== '') {
    const fromOverride = resolveCandidate(override, platform, fs);
    if (fromOverride !== undefined) {
      return fromOverride;
    }
    if (platform === 'win32' && isWindowsWrapper(override)) {
      const fromVersions = resolveNewestWindowsInstall(env, fs);
      if (fromVersions !== undefined) {
        return fromVersions;
      }
    }
    return { command: override, prefixArgs: [] };
  }

  for (const candidate of commonCursorAgentPaths(env, platform, fs)) {
    const resolved = resolveCandidate(candidate, platform, fs);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  const newest = platform === 'win32' ? resolveNewestWindowsInstall(env, fs) : undefined;
  if (newest !== undefined) {
    return newest;
  }

  return { command: CURSOR_AGENT_BINARY, prefixArgs: [] };
}

/**
 * Resolves which binary to spawn for `cursor-agent`.
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
  platform: NodeJS.Platform = process.platform,
  fs: CursorAgentPathFs = defaultFs,
): string[] {
  const paths: string[] = [];
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim();
    if (localAppData !== undefined && localAppData !== '') {
      const versionsDir = path.win32.join(localAppData, 'cursor-agent', 'versions');
      for (const version of listWindowsVersionsNewestFirst(versionsDir, fs)) {
        paths.push(path.win32.join(versionsDir, version, 'cursor-agent.cmd'));
      }
      paths.push(path.win32.join(localAppData, 'cursor-agent', 'cursor-agent.cmd'));
    }
    if (home !== undefined && home !== '') {
      paths.push(path.win32.join(home, '.npm-global', 'cursor-agent.cmd'));
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

/**
 * Compares installer version folder names. Higher/newer wins.
 * Handles `2026.01.28-abc`, `1.10.0`, and mixed labels.
 */
export function compareVersionLabels(a: string, b: string): number {
  const aParts = numericVersionParts(a);
  const bParts = numericVersionParts(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return a.localeCompare(b);
}

export function sortVersionsNewestFirst(versions: readonly string[]): string[] {
  return [...versions].sort((left, right) => compareVersionLabels(right, left));
}

export function isWindowsWrapper(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.cmd' || ext === '.ps1' || ext === '.bat';
}

function isResolveOptions(
  value: NodeJS.ProcessEnv | ResolveCursorAgentOptions,
): value is ResolveCursorAgentOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('env' in value || 'platform' in value || 'fs' in value)
  );
}

function numericVersionParts(label: string): number[] {
  return label
    .split(/[^0-9]+/)
    .filter((part) => part !== '')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function listWindowsVersionsNewestFirst(
  versionsDir: string,
  fs: CursorAgentPathFs,
): string[] {
  if (!fs.existsSync(versionsDir)) {
    return [];
  }
  try {
    const names = fs.readdirSync(versionsDir);
    return sortVersionsNewestFirst(names);
  } catch {
    return [];
  }
}

function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path;
}

function resolveNewestWindowsInstall(
  env: NodeJS.ProcessEnv,
  fs: CursorAgentPathFs,
): CursorAgentInvocation | undefined {
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData === undefined || localAppData === '') {
    return undefined;
  }
  const versionsDir = path.win32.join(localAppData, 'cursor-agent', 'versions');
  for (const version of listWindowsVersionsNewestFirst(versionsDir, fs)) {
    const wrapper = path.win32.join(versionsDir, version, 'cursor-agent.cmd');
    const resolved = resolveWindowsWrapperToNodeInvocation(wrapper, fs, 'win32');
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return undefined;
}

function resolveCandidate(
  candidate: string,
  platform: NodeJS.Platform,
  fs: CursorAgentPathFs,
): CursorAgentInvocation | undefined {
  if (platform === 'win32' && isWindowsWrapper(candidate)) {
    return resolveWindowsWrapperToNodeInvocation(candidate, fs, platform);
  }
  if (isExecutableFile(candidate, fs)) {
    return { command: candidate, prefixArgs: [] };
  }
  return undefined;
}

/**
 * Resolves a Windows .cmd/.ps1 wrapper to the underlying node.exe + index.js.
 * Official installer layout:
 * %LOCALAPPDATA%\cursor-agent\
 *   cursor-agent.cmd
 *   versions\<ver>\cursor-agent.cmd
 *   versions\<ver>\node.exe
 *   versions\<ver>\index.js
 */
export function resolveWindowsWrapperToNodeInvocation(
  wrapperPath: string,
  fs: CursorAgentPathFs = defaultFs,
  platform: NodeJS.Platform = 'win32',
): CursorAgentInvocation | undefined {
  const p = pathFor(platform);
  const dir = p.dirname(wrapperPath);
  const sameDir = nodeInvocationInDir(dir, fs, p);
  if (sameDir !== undefined) {
    return sameDir;
  }

  const parent = p.dirname(dir);
  const parentName = p.basename(parent).toLowerCase();
  const dirName = p.basename(dir).toLowerCase();
  if (dirName === 'cursor-agent' || parentName === 'cursor-agent') {
    const versionsDir =
      dirName === 'versions'
        ? dir
        : p.join(dirName === 'cursor-agent' ? dir : parent, 'versions');
    for (const version of listWindowsVersionsNewestFirst(versionsDir, fs)) {
      const versionDir = p.join(versionsDir, version);
      const resolved = nodeInvocationInDir(versionDir, fs, p);
      if (resolved !== undefined) {
        return resolved;
      }
    }
  }

  return undefined;
}

function nodeInvocationInDir(
  dir: string,
  fs: CursorAgentPathFs,
  p: path.PlatformPath,
): CursorAgentInvocation | undefined {
  const nodeExe = p.join(dir, 'node.exe');
  const indexJs = p.join(dir, 'index.js');
  if (fs.existsSync(nodeExe) && fs.existsSync(indexJs)) {
    return {
      command: nodeExe,
      prefixArgs: [indexJs],
    };
  }
  return undefined;
}

function isExecutableFile(filePath: string, fs: CursorAgentPathFs): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  if (fs.accessSync === undefined) {
    return true;
  }
  try {
    fs.accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
