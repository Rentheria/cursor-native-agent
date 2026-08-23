import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { PreparedAttachment } from './types.js';
import { convertPdfWithMarkItDown } from './markitdown.js';

const DEFAULT_MAX_TEXT_SIZE = 50_000;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.sh',
  '.bash',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
]);

export async function prepareAttachment(
  filePath: string,
  maxTextSize = DEFAULT_MAX_TEXT_SIZE,
): Promise<PreparedAttachment> {
  const ext = extname(filePath).toLowerCase();

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot access file: ${message}`);
  }

  if (ext === '.pdf') {
    return await preparePdf(filePath, maxTextSize);
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return prepareImage(filePath);
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return await prepareTextFile(filePath, maxTextSize);
  }

  return prepareBinarySkipped(filePath);
}

async function preparePdf(
  filePath: string,
  maxTextSize: number,
): Promise<PreparedAttachment> {
  try {
    const result = await convertPdfWithMarkItDown(filePath, maxTextSize);
    let text = result.markdown;

    if (result.truncated) {
      text += `\n\n[PDF content truncated at ${String(maxTextSize)} characters]`;
    }

    return {
      kind: 'pdf',
      originalPath: filePath,
      text,
      truncated: result.truncated,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[attachments] PDF conversion failed: ${message}`);
    return {
      kind: 'binary-skipped',
      originalPath: filePath,
      text: `[PDF file (conversion failed): ${filePath}]`,
    };
  }
}

function prepareImage(filePath: string): PreparedAttachment {
  return {
    kind: 'image',
    originalPath: filePath,
    imagePath: filePath,
  };
}

async function prepareTextFile(
  filePath: string,
  maxTextSize: number,
): Promise<PreparedAttachment> {
  try {
    const content = await readFile(filePath, 'utf8');
    const truncated = content.length > maxTextSize;
    let text = truncated ? content.slice(0, maxTextSize) : content;

    if (truncated) {
      text += `\n\n[Text file truncated at ${String(maxTextSize)} characters]`;
    }

    return {
      kind: 'text',
      originalPath: filePath,
      text,
      truncated,
      size: content.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read text file: ${message}`);
  }
}

function prepareBinarySkipped(filePath: string): PreparedAttachment {
  return {
    kind: 'binary-skipped',
    originalPath: filePath,
    text: `[Binary file skipped: ${filePath}]`,
  };
}
