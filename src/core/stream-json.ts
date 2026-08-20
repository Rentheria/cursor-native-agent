/**
 * Helpers for `cursor-agent --output-format stream-json --stream-partial-output`.
 * Partial assistant deltas carry `timestamp_ms`; the final assistant event and
 * `result` carry the full text (we prefer `result` as the canonical reply).
 */

export interface StreamJsonAssistantDelta {
  readonly text: string;
}

export interface StreamJsonParseResult {
  readonly assistantDelta: string | undefined;
  readonly resultText: string | undefined;
}

/** Parses one NDJSON line from stream-json output. */
export function parseStreamJsonLine(line: string): StreamJsonParseResult {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { assistantDelta: undefined, resultText: undefined };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { assistantDelta: undefined, resultText: undefined };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { assistantDelta: undefined, resultText: undefined };
  }

  const record = parsed as Record<string, unknown>;
  const type = record['type'];

  if (type === 'assistant' && typeof record['timestamp_ms'] === 'number') {
    return {
      assistantDelta: extractAssistantText(record),
      resultText: undefined,
    };
  }

  if (type === 'result' && record['subtype'] === 'success') {
    const result = record['result'];
    return {
      assistantDelta: undefined,
      resultText: typeof result === 'string' ? result : undefined,
    };
  }

  return { assistantDelta: undefined, resultText: undefined };
}

function extractAssistantText(record: Record<string, unknown>): string | undefined {
  const message = record['message'];
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }
  const content = (message as Record<string, unknown>)['content'];
  if (!Array.isArray(content)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const item of content) {
    if (
      typeof item === 'object' &&
      item !== null &&
      (item as Record<string, unknown>)['type'] === 'text' &&
      typeof (item as Record<string, unknown>)['text'] === 'string'
    ) {
      parts.push((item as Record<string, unknown>)['text'] as string);
    }
  }
  const text = parts.join('');
  return text === '' ? undefined : text;
}
