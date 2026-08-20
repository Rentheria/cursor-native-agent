import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MEMORY_DIRECTORY_NAME,
  MEMORY_INDEX_FILE_NAME,
} from '../lib/constants.js';
import {
  readMarkdownWithFrontmatter,
  readNestedString,
  requireStringAttribute,
} from './frontmatter.js';
import { extractKeywords, promptMatchesKeywords } from './keyword-match.js';
import { selectSemanticMemoryDetails } from './semantic-memory.js';
import type {
  MemoryDetailDocument,
  MemoryIndexEntry,
  MemoryLoadResult,
} from '../lib/types.js';

const INDEX_ENTRY_PATTERN =
  /^- \[([^\]]+)\]\(([^)]+)\)\s*(?:—|-)\s*(.+)$/;

export async function loadMemoryForPrompt(
  repoRoot: string,
  prompt: string,
): Promise<MemoryLoadResult> {
  const indexPath = path.join(repoRoot, MEMORY_INDEX_FILE_NAME);
  const indexMarkdown = await readFile(indexPath, 'utf8');
  const indexEntries = parseMemoryIndex(indexMarkdown);
  const detailsCatalog = await loadAllMemoryDetails(repoRoot);
  const details = await selectRelevantMemoryDetails(
    prompt,
    detailsCatalog,
    indexEntries,
  );

  return {
    indexMarkdown: indexMarkdown.trim(),
    indexEntries,
    details,
  };
}

export function parseMemoryIndex(indexMarkdown: string): readonly MemoryIndexEntry[] {
  const entries: MemoryIndexEntry[] = [];
  for (const line of indexMarkdown.split(/\r?\n/)) {
    const match = INDEX_ENTRY_PATTERN.exec(line.trim());
    if (!match) {
      continue;
    }
    const title = match[1];
    const relativePath = match[2];
    const hook = match[3];
    if (title === undefined || relativePath === undefined || hook === undefined) {
      continue;
    }
    entries.push({
      title: title.trim(),
      relativePath: relativePath.trim(),
      hook: hook.trim(),
      line: line.trim(),
    });
  }
  return entries;
}

/**
 * Keyword match first (literal index/detail hooks), then semantic similarity
 * for remaining entries when the prompt does not hit those keywords.
 */
export async function selectRelevantMemoryDetails(
  prompt: string,
  catalog: readonly MemoryDetailDocument[],
  indexEntries: readonly MemoryIndexEntry[],
): Promise<readonly MemoryDetailDocument[]> {
  const keywordMatched = selectMemoryDetailsByKeywords(
    prompt,
    catalog,
    indexEntries,
  );
  const keywordLinks = new Set(
    keywordMatched.map((detail) => detail.relativeLink),
  );
  const unmatched = catalog.filter(
    (detail) => !keywordLinks.has(detail.relativeLink),
  );

  const semanticHits = await selectSemanticMemoryDetails(
    prompt,
    unmatched,
    indexEntries,
  );
  const semanticMatched = semanticHits.map((hit) => hit.detail);

  return [...keywordMatched, ...semanticMatched];
}

/** Literal keyword selection only (no embeddings). */
export function selectMemoryDetailsByKeywords(
  prompt: string,
  catalog: readonly MemoryDetailDocument[],
  indexEntries: readonly MemoryIndexEntry[],
): readonly MemoryDetailDocument[] {
  return catalog.filter((detail) => {
    const indexEntry = indexEntries.find(
      (entry) => entry.relativePath === detail.relativeLink,
    );
    const searchText = [
      detail.name,
      detail.description,
      detail.memoryType,
      indexEntry?.title ?? '',
      indexEntry?.hook ?? '',
    ].join(' ');
    const keywords = extractKeywords(searchText);
    return promptMatchesKeywords(prompt, keywords);
  });
}

async function loadAllMemoryDetails(
  repoRoot: string,
): Promise<readonly MemoryDetailDocument[]> {
  const memoryDir = path.join(repoRoot, MEMORY_DIRECTORY_NAME);
  const entries = await readdir(memoryDir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(memoryDir, entry.name))
    .toSorted();

  const details: MemoryDetailDocument[] = [];
  for (const filePath of markdownFiles) {
    details.push(await loadMemoryDetailFile(repoRoot, filePath));
  }
  return details;
}

async function loadMemoryDetailFile(
  repoRoot: string,
  filePath: string,
): Promise<MemoryDetailDocument> {
  const { attributes, body } = await readMarkdownWithFrontmatter(filePath);
  const name = requireStringAttribute(attributes, 'name', filePath);
  const description = requireStringAttribute(attributes, 'description', filePath);
  const nestedType = readNestedString(attributes, 'metadata', 'type');
  const topLevelType =
    typeof attributes['type'] === 'string' ? attributes['type'].trim() : undefined;
  const memoryType = nestedType ?? topLevelType;
  if (memoryType === undefined || memoryType === '') {
    throw new Error(`Missing required frontmatter "metadata.type" in ${filePath}`);
  }

  const relativeLink = path
    .relative(repoRoot, filePath)
    .split(path.sep)
    .join('/');

  return {
    name,
    description,
    memoryType,
    body,
    filePath,
    relativeLink,
  };
}
