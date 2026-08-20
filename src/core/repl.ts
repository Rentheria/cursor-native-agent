import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { runCursorAgent } from './cursor-agent.js';
import {
  appendAgentNdjson,
  buildTurnDebugReport,
  printTurnDebug,
} from './debug.js';
import {
  parseMemoryIndex,
  selectRelevantMemoryDetails,
} from '../loaders/memory-loader.js';
import { applyMemoryWritesFromText } from '../loaders/memory-writer.js';
import { assemblePrompt } from './prompt-builder.js';
import { loadAllSkills, selectRelevantSkills } from '../loaders/skills-loader.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  MEMORY_DIRECTORY_NAME,
  MEMORY_INDEX_FILE_NAME,
  CURSOR_AGENT_BINARY,
} from '../lib/constants.js';
import {
  readMarkdownWithFrontmatter,
  requireStringAttribute,
  readNestedString,
} from '../loaders/frontmatter.js';
import type { MemoryDetailDocument, MemoryLoadResult } from '../lib/types.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ReplOptions {
  readonly debug?: boolean;
}

async function loadAllMemoryDetailsSafe(repoRoot: string): Promise<readonly MemoryDetailDocument[]> {
  const memoryDir = path.join(repoRoot, MEMORY_DIRECTORY_NAME);
  let entries;
  try {
    entries = await readdir(memoryDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(memoryDir, entry.name))
    .toSorted();

  const details: MemoryDetailDocument[] = [];
  for (const filePath of markdownFiles) {
    try {
      const { attributes, body } = await readMarkdownWithFrontmatter(filePath);
      const name = requireStringAttribute(attributes, 'name', filePath);
      const description = requireStringAttribute(attributes, 'description', filePath);
      const nestedType = readNestedString(attributes, 'metadata', 'type');
      const topLevelType = typeof attributes['type'] === 'string' ? attributes['type'].trim() : undefined;
      const memoryType = nestedType ?? topLevelType;
      if (memoryType === undefined || memoryType === '') {
        continue;
      }
      const relativeLink = path.relative(repoRoot, filePath).split(path.sep).join('/');
      details.push({ name, description, memoryType, body, filePath, relativeLink });
    } catch {
      // skip invalid
    }
  }
  return details;
}

export async function runRepl(
  repoRoot: string,
  options: ReplOptions = {},
): Promise<void> {
  const debug = options.debug === true;
  console.error('[agent] Loading skills and memory once for REPL...');
  const allSkills = await loadAllSkills(repoRoot);

  const indexPath = path.join(repoRoot, MEMORY_INDEX_FILE_NAME);
  let indexMarkdown = '';
  try {
    indexMarkdown = await readFile(indexPath, 'utf8');
  } catch {
    // index might not exist
  }
  const indexEntries = parseMemoryIndex(indexMarkdown);
  const detailsCatalog = await loadAllMemoryDetailsSafe(repoRoot);

  console.error(
    `[agent] Loaded ${allSkills.length} skills and ${detailsCatalog.length} memory details.`,
  );

  // Create chat session
  console.error('[agent] Creating continuous chat session...');
  const createChatResult = await execFileAsync(CURSOR_AGENT_BINARY, ['create-chat']);
  const chatId = createChatResult.stdout.trim();

  const rl = createInterface({ input, output });
  let isFirstTurn = true;

  try {
    while (true) {
      const userPrompt = await rl.question('prompt> ');
      const trimmed = userPrompt.trim();

      if (!trimmed) continue;
      if (trimmed === 'exit' || trimmed === '.exit') break;

      let promptToSend = trimmed;

      if (isFirstTurn) {
        // Only inject context on the first turn
        const matchedSkills = await selectRelevantSkills(trimmed, allSkills);
        const matchedDetails = await selectRelevantMemoryDetails(
          trimmed,
          detailsCatalog,
          indexEntries,
        );

        const memory: MemoryLoadResult = {
          indexMarkdown: indexMarkdown.trim(),
          indexEntries,
          details: matchedDetails,
        };

        const report = buildTurnDebugReport({
          prompt: trimmed,
          allSkills,
          matchedSkills,
          memory,
        });
        await appendAgentNdjson(repoRoot, report);
        if (debug) {
          printTurnDebug(report);
        }

        const assembled = assemblePrompt({
          userPrompt: trimmed,
          matchedSkills,
          memory,
        });
        promptToSend = assembled.finalPrompt;
        isFirstTurn = false;
      }

      const result = await runCursorAgent({
        prompt: promptToSend,
        cwd: repoRoot,
        force: true,
        trust: true,
        resumeChatId: chatId,
      });

      if (result.stderr.trim() !== '') {
        console.error(result.stderr.trimEnd());
      }

      const { cleanedText, writes } = await applyMemoryWritesFromText(
        repoRoot,
        result.stdout,
      );
      if (writes.length > 0) {
        console.error(
          `[memory] Applied ${String(writes.length)} memory write(s) this turn`,
        );
      }

      process.stdout.write(cleanedText);
      if (!cleanedText.endsWith('\n')) {
        process.stdout.write('\n');
      }
    }
  } finally {
    rl.close();
  }
}
