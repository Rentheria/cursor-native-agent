import { stat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedMention, ParsedMentions } from './types.js';

const MENTION_PATTERN = /@([\w\-./]+\/?)/g;
const MAX_FILE_SIZE = 50_000;
const MAX_DIR_FILES = 20;

export async function parseMentions(
  prompt: string,
  repoRoot: string,
): Promise<ParsedMentions> {
  const matches = Array.from(prompt.matchAll(MENTION_PATTERN));
  if (matches.length === 0) {
    return { mentions: [], cleanedPrompt: prompt };
  }

  const mentions: ResolvedMention[] = [];
  for (const match of matches) {
    const mention = match[0];
    const mentionPath = match[1];
    if (mentionPath === undefined) {
      continue;
    }

    const resolved = await resolveMention(mention, mentionPath, repoRoot);
    mentions.push(resolved);
  }

  return { mentions, cleanedPrompt: prompt };
}

async function resolveMention(
  originalMention: string,
  mentionPath: string,
  repoRoot: string,
): Promise<ResolvedMention> {
  const resolvedPath = path.isAbsolute(mentionPath)
    ? mentionPath
    : path.resolve(repoRoot, mentionPath);

  try {
    const stats = await stat(resolvedPath);

    if (stats.isFile()) {
      return await resolveFileMention(originalMention, resolvedPath);
    }

    if (stats.isDirectory()) {
      return await resolveDirectoryMention(originalMention, resolvedPath);
    }

    return {
      kind: 'file',
      originalMention,
      resolvedPath,
      error: 'Not a file or directory',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'file',
      originalMention,
      resolvedPath,
      error: `Cannot access: ${message}`,
    };
  }
}

async function resolveFileMention(
  originalMention: string,
  resolvedPath: string,
): Promise<ResolvedMention> {
  try {
    const content = await readFile(resolvedPath, 'utf8');
    const truncated = content.length > MAX_FILE_SIZE;
    const finalContent = truncated
      ? content.slice(0, MAX_FILE_SIZE) +
        `\n\n[File truncated at ${String(MAX_FILE_SIZE)} characters]`
      : content;

    return {
      kind: 'file',
      originalMention,
      resolvedPath,
      content: finalContent,
      truncated,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'file',
      originalMention,
      resolvedPath,
      error: `Failed to read: ${message}`,
    };
  }
}

async function resolveDirectoryMention(
  originalMention: string,
  resolvedPath: string,
): Promise<ResolvedMention> {
  try {
    const entries = await readdir(resolvedPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .slice(0, MAX_DIR_FILES);
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name + '/')
      .slice(0, MAX_DIR_FILES);

    const allEntries = [...dirs, ...files];
    const truncated = entries.length > allEntries.length;

    let content = `Directory listing: ${resolvedPath}\n\n`;
    content += allEntries.join('\n');
    if (truncated) {
      content += `\n\n[Directory listing truncated; showing first ${String(MAX_DIR_FILES)} files and ${String(MAX_DIR_FILES)} directories]`;
    }

    return {
      kind: 'directory',
      originalMention,
      resolvedPath,
      content,
      truncated,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'directory',
      originalMention,
      resolvedPath,
      error: `Failed to list: ${message}`,
    };
  }
}
