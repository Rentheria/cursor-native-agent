import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import type { MarkItDownResult } from './types.js';

const DEFAULT_MAX_MARKDOWN_SIZE = 100_000;

export async function convertPdfWithMarkItDown(
  pdfPath: string,
  maxSize = DEFAULT_MAX_MARKDOWN_SIZE,
): Promise<MarkItDownResult> {
  const binary = await resolveMarkItDownBinary();
  if (binary === undefined) {
    throw new Error(
      'MarkItDown not found. Install with: pip install markitdown[pdf]',
    );
  }

  return await new Promise<MarkItDownResult>((resolve, reject) => {
    const args = [pdfPath];
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error: Error) => {
      reject(
        new Error(`Failed to spawn markitdown: ${error.message}`, {
          cause: error,
        }),
      );
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `markitdown exited with code ${String(code)}: ${stderr.trim()}`,
          ),
        );
        return;
      }

      const truncated = stdout.length > maxSize;
      const markdown = truncated ? stdout.slice(0, maxSize) : stdout;

      resolve({ markdown, truncated });
    });
  });
}

async function resolveMarkItDownBinary(): Promise<string | undefined> {
  const candidates = ['markitdown', 'python3 -m markitdown', 'python -m markitdown'];

  for (const candidate of candidates) {
    const parts = candidate.split(' ');
    const binary = parts[0];
    if (binary === undefined) {
      continue;
    }

    try {
      await access(binary, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  const pathDirs = (process.env.PATH ?? '').split(':');
  for (const dir of pathDirs) {
    for (const candidate of ['markitdown']) {
      const fullPath = `${dir}/${candidate}`;
      try {
        await access(fullPath, constants.X_OK);
        return fullPath;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}
