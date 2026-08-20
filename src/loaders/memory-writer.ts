import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MEMORY_DIRECTORY_NAME,
  MEMORY_INDEX_FILE_NAME,
} from '../lib/constants.js';

export interface MemoryWriteInput {
  readonly slug: string;
  readonly title: string;
  readonly hook: string;
  readonly description: string;
  readonly memoryType: string;
  readonly body: string;
  /** Frontmatter `name`; defaults to slug. */
  readonly name?: string;
}

export interface MemoryWriteResult {
  readonly slug: string;
  readonly relativeLink: string;
  readonly detailPath: string;
  readonly indexPath: string;
  readonly indexLineAdded: boolean;
  readonly detailCreated: boolean;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEMORY_WRITE_BLOCK_PATTERN =
  /<<<MEMORY_WRITE\r?\n([\s\S]*?)\r?\nMEMORY_WRITE>>>/g;

/**
 * Normalize a free-form title into a filesystem slug (kebab-case).
 */
export function slugifyMemoryTitle(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (normalized === '') {
    throw new Error('Cannot derive a memory slug from an empty title');
  }
  return normalized;
}

export function assertValidMemorySlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid memory slug "${slug}". Use lowercase letters, digits, and single hyphens (e.g. meetup-preference).`,
    );
  }
}

export function formatMemoryDetailMarkdown(input: MemoryWriteInput): string {
  const name = (input.name ?? input.slug).trim();
  const description = input.description.trim();
  const memoryType = input.memoryType.trim();
  const body = input.body.trim();
  if (name === '' || description === '' || memoryType === '' || body === '') {
    throw new Error(
      'Memory detail requires non-empty name, description, type, and body',
    );
  }

  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    'metadata:',
    `  type: ${memoryType}`,
    '---',
    '',
    body,
    '',
  ].join('\n');
}

export function formatMemoryIndexLine(input: {
  readonly title: string;
  readonly relativePath: string;
  readonly hook: string;
}): string {
  const title = input.title.trim();
  const relativePath = input.relativePath.trim();
  const hook = input.hook.trim();
  if (title === '' || relativePath === '' || hook === '') {
    throw new Error('Memory index line requires non-empty title, path, and hook');
  }
  return `- [${title}](${relativePath}) — ${hook}`;
}

/**
 * Writes `memory/<slug>.md` and appends one index line to `MEMORY.md` when
 * that path is not already listed. Never silent: callers should log the result.
 */
export async function writeMemoryEntry(
  repoRoot: string,
  input: MemoryWriteInput,
): Promise<MemoryWriteResult> {
  const slug = input.slug.trim();
  assertValidMemorySlug(slug);

  const title = input.title.trim();
  const hook = input.hook.trim();
  if (title === '' || hook === '') {
    throw new Error('Memory write requires non-empty title and hook');
  }

  const relativeLink = `${MEMORY_DIRECTORY_NAME}/${slug}.md`;
  const detailPath = path.join(repoRoot, MEMORY_DIRECTORY_NAME, `${slug}.md`);
  const indexPath = path.join(repoRoot, MEMORY_INDEX_FILE_NAME);

  await mkdir(path.dirname(detailPath), { recursive: true });

  const detailCreated = !(await pathExists(detailPath));
  const markdown = formatMemoryDetailMarkdown({ ...input, slug });
  await writeFile(detailPath, markdown, 'utf8');

  let indexMarkdown = '';
  try {
    indexMarkdown = await readFile(indexPath, 'utf8');
  } catch (error: unknown) {
    if (!isNotFound(error)) {
      throw error;
    }
    indexMarkdown = [
      '# MEMORY — Long-term index',
      '',
      'Format: one line per memory, `- [Title](memory/file.md) — keywords`.',
      '',
      '',
    ].join('\n');
  }

  const indexLine = formatMemoryIndexLine({
    title,
    relativePath: relativeLink,
    hook,
  });
  const alreadyIndexed = indexMarkdown
    .split(/\r?\n/)
    .some((line) => line.includes(`](${relativeLink})`));

  let indexLineAdded = false;
  if (!alreadyIndexed) {
    const suffix = indexMarkdown.endsWith('\n') ? '' : '\n';
    await writeFile(indexPath, `${indexMarkdown}${suffix}${indexLine}\n`, 'utf8');
    indexLineAdded = true;
  }

  return {
    slug,
    relativeLink,
    detailPath,
    indexPath,
    indexLineAdded,
    detailCreated,
  };
}

export interface ParsedMemoryWrite {
  readonly input: MemoryWriteInput;
  readonly rawBlock: string;
}

/**
 * Extracts `<<<MEMORY_WRITE … MEMORY_WRITE>>>` blocks from agent stdout.
 * Fields above `---` are `key: value` lines; body is everything after.
 */
export function parseMemoryWriteBlocks(text: string): readonly ParsedMemoryWrite[] {
  const results: ParsedMemoryWrite[] = [];
  for (const match of text.matchAll(MEMORY_WRITE_BLOCK_PATTERN)) {
    const rawInner = match[1];
    const rawBlock = match[0];
    if (rawInner === undefined) {
      continue;
    }
    results.push({
      input: parseMemoryWriteInner(rawInner),
      rawBlock,
    });
  }
  return results;
}

/** Removes MEMORY_WRITE blocks from text (for clean user-facing stdout). */
export function stripMemoryWriteBlocks(text: string): string {
  return text
    .replace(MEMORY_WRITE_BLOCK_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/**
 * Parses blocks, writes each entry, logs visibly to stderr, returns cleaned text.
 */
export async function applyMemoryWritesFromText(
  repoRoot: string,
  text: string,
  log: (message: string) => void = (message) => {
    console.error(message);
  },
): Promise<{ readonly cleanedText: string; readonly writes: readonly MemoryWriteResult[] }> {
  const parsed = parseMemoryWriteBlocks(text);
  const writes: MemoryWriteResult[] = [];

  for (const entry of parsed) {
    log(
      `[memory] Writing ${MEMORY_DIRECTORY_NAME}/${entry.input.slug}.md and updating ${MEMORY_INDEX_FILE_NAME}…`,
    );
    const result = await writeMemoryEntry(repoRoot, entry.input);
    writes.push(result);
    const action = result.detailCreated ? 'created' : 'updated';
    const indexNote = result.indexLineAdded
      ? 'index line added'
      : 'index already had this path';
    log(`[memory] ${action} ${result.relativeLink} (${indexNote})`);
  }

  return {
    cleanedText: stripMemoryWriteBlocks(text),
    writes,
  };
}

function parseMemoryWriteInner(inner: string): MemoryWriteInput {
  const separator = /\r?\n---\r?\n/;
  const parts = inner.split(separator);
  if (parts.length < 2) {
    throw new Error(
      'MEMORY_WRITE block must separate fields from body with a line containing only ---',
    );
  }
  const header = parts[0] ?? '';
  const body = parts.slice(1).join('\n---\n').trim();
  const fields = parseFieldLines(header);

  const slugRaw = fields['slug']?.trim() ?? '';
  const title = fields['title']?.trim() ?? '';
  const hook = fields['hook']?.trim() ?? '';
  const description = fields['description']?.trim() ?? '';
  const memoryType = (fields['type'] ?? fields['memoryType'] ?? '').trim();
  const name = fields['name']?.trim();

  const slug = slugRaw === '' ? slugifyMemoryTitle(title) : slugRaw;
  assertValidMemorySlug(slug);

  if (title === '' || hook === '' || description === '' || memoryType === '') {
    throw new Error(
      'MEMORY_WRITE requires title, hook, description, and type (plus slug or a title to slugify)',
    );
  }
  if (body === '') {
    throw new Error('MEMORY_WRITE body after --- must not be empty');
  }

  return {
    slug,
    title,
    hook,
    description,
    memoryType,
    body,
    ...(name !== undefined && name !== '' ? { name } : {}),
  };
}

function parseFieldLines(header: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of header.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon <= 0) {
      throw new Error(`Invalid MEMORY_WRITE field line: "${trimmed}"`);
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    fields[key] = value;
  }
  return fields;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}
