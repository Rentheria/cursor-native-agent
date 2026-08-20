import { readFile } from 'node:fs/promises';

export interface ParsedFrontmatter {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * Minimal YAML-ish frontmatter parser for skill/memory markdown files.
 * Supports scalar keys and nested `metadata.type` (one level).
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(raw.trimStart());
  if (!match) {
    return { attributes: {}, body: raw.trim() };
  }

  const yamlBlock = match[1] ?? '';
  const body = (match[2] ?? '').trim();
  const attributes: Record<string, unknown> = {};
  let nestedKey: string | undefined;

  for (const line of yamlBlock.split(/\r?\n/)) {
    if (/^\s*$/.test(line) || line.trimStart().startsWith('#')) {
      continue;
    }

    const nestedScalar = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nestedScalar && nestedKey !== undefined) {
      const childKey = nestedScalar[1];
      const childValue = stripQuotes((nestedScalar[2] ?? '').trim());
      if (childKey === undefined) {
        continue;
      }
      const parent = attributes[nestedKey];
      if (typeof parent === 'object' && parent !== null && !Array.isArray(parent)) {
        (parent as Record<string, unknown>)[childKey] = childValue;
      }
      continue;
    }

    const topLevel = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!topLevel) {
      nestedKey = undefined;
      continue;
    }

    const key = topLevel[1];
    const valueRaw = (topLevel[2] ?? '').trim();
    if (key === undefined) {
      continue;
    }

    if (valueRaw === '') {
      attributes[key] = {};
      nestedKey = key;
      continue;
    }

    attributes[key] = stripQuotes(valueRaw);
    nestedKey = undefined;
  }

  return { attributes, body };
}

export async function readMarkdownWithFrontmatter(
  filePath: string,
): Promise<ParsedFrontmatter> {
  const raw = await readFile(filePath, 'utf8');
  return parseFrontmatter(raw);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function requireStringAttribute(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
  filePath: string,
): string {
  const value = attributes[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required frontmatter "${key}" in ${filePath}`);
  }
  return value.trim();
}

export function readNestedString(
  attributes: Readonly<Record<string, unknown>>,
  parentKey: string,
  childKey: string,
): string | undefined {
  const parent = attributes[parentKey];
  if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) {
    return undefined;
  }
  const value = (parent as Record<string, unknown>)[childKey];
  return typeof value === 'string' ? value.trim() : undefined;
}

/** Parses a comma-separated `triggers` frontmatter value into keywords. */
export function parseTriggerList(value: unknown): readonly string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((trigger) => trigger.trim().toLowerCase())
    .filter((trigger) => trigger.length > 0);
}
