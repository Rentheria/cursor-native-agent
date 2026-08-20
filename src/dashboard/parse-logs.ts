/**
 * Pure parsers for dashboard observability sources.
 * Read-only: never writes files.
 */

export type AgentTurnSummary = {
  readonly ts: string;
  readonly prompt: string;
  readonly skillsMatched: readonly string[];
  readonly memoryIndexEntries: number;
  readonly memoryLoadedDetails: readonly string[];
  /** Present on turns logged after perf instrumentation landed. */
  readonly cursorAgentMs?: number;
  readonly totalMs?: number;
  /** Cleaned assistant reply (MEMORY_WRITE blocks stripped). */
  readonly reply?: string;
  /** Exit code from cursor-agent. */
  readonly exitCode?: number;
};

export type ParsedCronFinding = {
  readonly startedAt: string;
  readonly finishedAt: string | undefined;
  readonly exitCode: number | undefined;
  readonly branch: string | undefined;
  readonly latest: string | undefined;
  readonly tree: string | undefined;
  readonly verdict: string | undefined;
  readonly note: string | undefined;
  /** Raw block text between markers (inclusive). */
  readonly raw: string;
};

export type MemoryIndexEntry = {
  readonly title: string;
  readonly href: string;
  readonly keywords: string;
};

const CRON_FINDING_BLOCK =
  /^=== CRON FINDING (.+?) ===\n([\s\S]*?)^===$/gm;

/**
 * Parses `logs/agent.ndjson` (one JSON object per line).
 * Returns the newest entries first, up to `limit`.
 */
export function parseAgentNdjson(
  raw: string,
  limit = 20,
): readonly AgentTurnSummary[] {
  if (limit <= 0 || raw.trim() === '') {
    return [];
  }

  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  const summaries: AgentTurnSummary[] = [];

  for (let i = lines.length - 1; i >= 0 && summaries.length < limit; i -= 1) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      const summary = toAgentTurnSummary(parsed);
      if (summary !== undefined) {
        summaries.push(summary);
      }
    } catch {
      // Skip malformed lines; observability should not crash the dashboard.
    }
  }

  return summaries;
}

/**
 * Parses `=== CRON FINDING … ===` blocks from `logs/cron.log`.
 * Returns the newest findings first, up to `limit`.
 */
export function parseCronFindings(
  raw: string,
  limit = 10,
): readonly ParsedCronFinding[] {
  if (limit <= 0 || raw.trim() === '') {
    return [];
  }

  const findings: ParsedCronFinding[] = [];
  const re = new RegExp(CRON_FINDING_BLOCK.source, CRON_FINDING_BLOCK.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    const startedAt = match[1]?.trim() ?? '';
    const body = match[2] ?? '';
    const fields = parseCronFindingFields(body);
    findings.push({
      startedAt,
      finishedAt: fields['finished'],
      exitCode: parseOptionalInt(fields['exit']),
      branch: fields['branch'],
      latest: fields['latest'],
      tree: fields['tree'],
      verdict: fields['verdict'],
      note: fields['note'],
      raw: match[0],
    });
  }

  // File appends newest last; reverse for newest-first display.
  findings.reverse();
  return findings.slice(0, limit);
}

/**
 * Extracts index bullet lines from `MEMORY.md`.
 * Format: `- [Title](memory/file.md) — keywords…`
 */
export function parseMemoryIndex(raw: string): readonly MemoryIndexEntry[] {
  const entries: MemoryIndexEntry[] = [];
  const lineRe = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s+[—-]\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRe.exec(raw)) !== null) {
    const title = match[1]?.trim();
    const href = match[2]?.trim();
    const keywords = match[3]?.trim();
    if (title && href && keywords) {
      entries.push({ title, href, keywords });
    }
  }

  return entries;
}

function toAgentTurnSummary(value: unknown): AgentTurnSummary | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const ts = typeof record['ts'] === 'string' ? record['ts'] : '';
  const prompt = typeof record['prompt'] === 'string' ? record['prompt'] : '';
  if (ts === '' && prompt === '') {
    return undefined;
  }

  const skillsMatched = Array.isArray(record['skillsMatched'])
    ? record['skillsMatched'].filter((item): item is string => typeof item === 'string')
    : [];

  const memory =
    typeof record['memory'] === 'object' && record['memory'] !== null
      ? (record['memory'] as Record<string, unknown>)
      : {};

  const memoryIndexEntries =
    typeof memory['indexEntries'] === 'number' ? memory['indexEntries'] : 0;
  const memoryLoadedDetails = Array.isArray(memory['loadedDetails'])
    ? memory['loadedDetails'].filter((item): item is string => typeof item === 'string')
    : [];

  const cursorAgentMs = readOptionalMs(record['cursorAgentMs']);
  const totalMs = readOptionalMs(record['totalMs']);
  const reply = typeof record['reply'] === 'string' ? record['reply'] : undefined;
  const exitCode = typeof record['exitCode'] === 'number' ? record['exitCode'] : undefined;

  return {
    ts,
    prompt,
    skillsMatched,
    memoryIndexEntries,
    memoryLoadedDetails,
    ...(cursorAgentMs !== undefined ? { cursorAgentMs } : {}),
    ...(totalMs !== undefined ? { totalMs } : {}),
    ...(reply !== undefined ? { reply } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
  };
}

function readOptionalMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCronFindingFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const trimmed = line.trimEnd();
    const colon = trimmed.indexOf(':');
    if (colon <= 0) {
      continue;
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (key !== '' && value !== '') {
      fields[key] = value;
    }
  }
  return fields;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
