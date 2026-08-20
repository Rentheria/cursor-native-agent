import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { MemoryLoadResult, SkillDocument } from '../lib/types.js';
import { findMatchingKeywords } from '../loaders/keyword-match.js';

export const AGENT_NDJSON_RELATIVE_PATH = 'logs/agent.ndjson';

export interface SkillMatchDebug {
  readonly name: string;
  readonly triggers: readonly string[];
  readonly matched: boolean;
  readonly matchedTriggers: readonly string[];
}

export interface MemoryMatchDebug {
  readonly indexEntries: number;
  readonly loadedDetails: readonly string[];
}

export interface TurnDebugReport {
  readonly ts: string;
  readonly prompt: string;
  readonly skillsEvaluated: readonly SkillMatchDebug[];
  readonly skillsMatched: readonly string[];
  readonly memory: MemoryMatchDebug;
  /** Wall time of `runCursorAgent` / `runCursorAgentLogged` call(s), ms. */
  readonly cursorAgentMs?: number;
  /** Wall time of the full turn (prompt in → reply out), ms. */
  readonly totalMs?: number;
  /** Cleaned assistant reply (MEMORY_WRITE blocks stripped). */
  readonly reply?: string;
  /** Exit code from cursor-agent. */
  readonly exitCode?: number;
}

/** True when `--debug` / `-d` is present or CURSOR_NATIVE_AGENT_DEBUG is set. */
export function isDebugEnabled(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (argv.includes('--debug') || argv.includes('-d')) {
    return true;
  }
  const flag = env['CURSOR_NATIVE_AGENT_DEBUG'];
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/** Strips debug flags so they are not treated as part of the user prompt. */
export function stripDebugFlags(argv: readonly string[]): readonly string[] {
  return argv.filter((arg) => arg !== '--debug' && arg !== '-d');
}

export function buildTurnDebugReport(params: {
  readonly prompt: string;
  readonly allSkills: readonly SkillDocument[];
  readonly matchedSkills: readonly SkillDocument[];
  readonly memory: MemoryLoadResult;
}): TurnDebugReport {
  const matchedNames = new Set(params.matchedSkills.map((skill) => skill.name));
  const skillsEvaluated: SkillMatchDebug[] = params.allSkills.map((skill) => {
    const matchedTriggers = findMatchingKeywords(params.prompt, skill.triggers);
    return {
      name: skill.name,
      triggers: skill.triggers,
      matched: matchedNames.has(skill.name),
      matchedTriggers,
    };
  });

  return {
    ts: new Date().toISOString(),
    prompt: params.prompt,
    skillsEvaluated,
    skillsMatched: params.matchedSkills.map((skill) => skill.name),
    memory: {
      indexEntries: params.memory.indexEntries.length,
      loadedDetails: params.memory.details.map((detail) => detail.name),
    },
  };
}

/** Prints a human-readable debug dump to stderr (only when debug is on). */
export function printTurnDebug(report: TurnDebugReport): void {
  console.error('[debug] --- turn match report ---');
  console.error(`[debug] prompt: ${truncate(report.prompt, 120)}`);
  console.error(`[debug] skills evaluated: ${String(report.skillsEvaluated.length)}`);
  for (const skill of report.skillsEvaluated) {
    if (skill.matched) {
      const why =
        skill.matchedTriggers.length > 0
          ? `triggers=[${skill.matchedTriggers.join(', ')}]`
          : 'matched';
      console.error(`[debug]   ✓ ${skill.name} (${why})`);
    } else {
      console.error(
        `[debug]   · ${skill.name} (no match; triggers=[${skill.triggers.join(', ')}])`,
      );
    }
  }
  console.error(
    `[debug] skills matched: ${report.skillsMatched.join(', ') || '(none)'}`,
  );
  console.error(
    `[debug] memory index entries: ${String(report.memory.indexEntries)}; details: ${
      report.memory.loadedDetails.join(', ') || '(none)'
    }`,
  );
  console.error('[debug] --- end turn match report ---');
}

/** Appends one NDJSON line to logs/agent.ndjson (silent observability). */
export async function appendAgentNdjson(
  repoRoot: string,
  report: TurnDebugReport,
): Promise<void> {
  const dir = path.join(repoRoot, 'logs');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(repoRoot, AGENT_NDJSON_RELATIVE_PATH);
  await appendFile(filePath, `${JSON.stringify(report)}\n`, 'utf8');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
