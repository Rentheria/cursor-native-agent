import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads env vars from repo-root `.env.example` (defaults) then `.env`
 * (overrides) into `process.env` without overriding existing shell exports.
 *
 * If `.env` is missing, `.env.example` defaults still apply. This makes a
 * fresh clone runnable without hand-editing env files.
 *
 * Layering (lowest to highest priority):
 * 1. .env.example (committed defaults)
 * 2. .env (local overrides, gitignored)
 * 3. Shell exports (already in process.env, never touched)
 */
export function loadRepoEnv(repoRoot?: string): string | undefined {
  const root = repoRoot ?? resolveRepoRootFromHere();
  const examplePath = path.join(root, '.env.example');
  const envPath = path.join(root, '.env');

  // Parse both files (if they exist)
  const exampleVars = existsSync(examplePath)
    ? parseDotEnv(readFileSync(examplePath, 'utf8'))
    : {};
  const envVars = existsSync(envPath)
    ? parseDotEnv(readFileSync(envPath, 'utf8'))
    : {};

  // Merge: .env overrides .env.example
  const merged = { ...exampleVars, ...envVars };

  // Apply to process.env (shell exports win)
  applyParsedEnv(merged, process.env);

  // Return path info for diagnostics
  if (existsSync(envPath)) {
    return envPath;
  }
  return existsSync(examplePath) ? examplePath : undefined;
}

/** Parses a dotenv body into key/value pairs (no expansion). */
export function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key === '' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Writes parsed pairs into `env` only when the key is unset or empty. */
export function applyParsedEnv(
  parsed: Record<string, string>,
  env: NodeJS.ProcessEnv,
): void {
  for (const [key, value] of Object.entries(parsed)) {
    const current = env[key];
    if (current === undefined || current === '') {
      env[key] = value;
    }
  }
}

function resolveRepoRootFromHere(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}
