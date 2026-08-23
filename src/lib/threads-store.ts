import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const THREADS_DIR_NAME = 'threads';
export const MAX_MESSAGES_PER_THREAD = 50;
export const MAX_THREAD_CONTEXT_CHARS = 14000;
/**
 * Soft cap per individual message content. Messages longer than this
 * will be truncated with a clear marker to prevent one huge message
 * from consuming the entire thread context budget.
 */
export const MAX_SINGLE_MESSAGE_CHARS = 4000;

export type ThreadMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
};

export type Thread = {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly ThreadMessage[];
};

export type ThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
};

/**
 * Returns the threads directory path. Threads are stored under repoRoot/threads/
 * and are gitignored to keep conversation history private.
 */
export function getThreadsDir(repoRoot: string): string {
  return path.join(repoRoot, THREADS_DIR_NAME);
}

/**
 * Returns the path to a thread file.
 */
function getThreadPath(repoRoot: string, threadId: string): string {
  return path.join(getThreadsDir(repoRoot), `${threadId}.json`);
}

/**
 * Generates a new thread ID.
 */
export function generateThreadId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `thread-${timestamp}-${random}`;
}

/**
 * Extracts a title from the first user message (first 60 chars).
 */
function extractTitle(messages: readonly ThreadMessage[]): string {
  const firstUser = messages.find((msg) => msg.role === 'user');
  if (firstUser === undefined) {
    return '(sin título)';
  }
  const content = firstUser.content.trim();
  if (content.length <= 60) {
    return content;
  }
  return `${content.slice(0, 60)}…`;
}

/**
 * Creates a new thread with an initial user message.
 */
export async function createThread(
  repoRoot: string,
  userMessage: string,
): Promise<Thread> {
  const threadsDir = getThreadsDir(repoRoot);
  await mkdir(threadsDir, { recursive: true });

  const id = generateThreadId();
  const now = new Date().toISOString();
  const thread: Thread = {
    id,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        role: 'user',
        content: userMessage,
        timestamp: now,
      },
    ],
  };

  const threadPath = getThreadPath(repoRoot, id);
  await writeFile(threadPath, JSON.stringify(thread, null, 2), 'utf8');
  return thread;
}

/**
 * Loads a thread by ID. Returns undefined if not found.
 */
export async function loadThread(
  repoRoot: string,
  threadId: string,
): Promise<Thread | undefined> {
  const threadPath = getThreadPath(repoRoot, threadId);
  if (!existsSync(threadPath)) {
    return undefined;
  }
  try {
    const raw = await readFile(threadPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidThread(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Creates or resets a thread with a specific ID (for Telegram stable thread IDs).
 * If the thread exists, it's cleared. If not, it's created empty.
 * Returns the new empty thread.
 */
export async function createOrResetThread(
  repoRoot: string,
  threadId: string,
): Promise<Thread> {
  const threadsDir = getThreadsDir(repoRoot);
  await mkdir(threadsDir, { recursive: true });

  const now = new Date().toISOString();
  const thread: Thread = {
    id: threadId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  const threadPath = getThreadPath(repoRoot, threadId);
  await writeFile(threadPath, JSON.stringify(thread, null, 2), 'utf8');
  return thread;
}

/**
 * Ensures a thread exists. If it doesn't exist, creates an empty thread.
 * Returns the thread (either existing or newly created).
 */
export async function ensureThread(
  repoRoot: string,
  threadId: string,
): Promise<Thread> {
  const existing = await loadThread(repoRoot, threadId);
  if (existing !== undefined) {
    return existing;
  }
  return createOrResetThread(repoRoot, threadId);
}

/**
 * Appends a message to an existing thread. Returns the updated thread.
 * If the thread doesn't exist, creates it first (defense in depth).
 */
export async function appendToThread(
  repoRoot: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<Thread> {
  // Defense in depth: ensure thread exists before appending
  const existing = await ensureThread(repoRoot, threadId);

  const now = new Date().toISOString();
  const newMessage: ThreadMessage = { role, content, timestamp: now };
  
  // Cap messages at MAX_MESSAGES_PER_THREAD (keep most recent)
  const allMessages = [...existing.messages, newMessage];
  const cappedMessages =
    allMessages.length > MAX_MESSAGES_PER_THREAD
      ? allMessages.slice(allMessages.length - MAX_MESSAGES_PER_THREAD)
      : allMessages;

  const updated: Thread = {
    ...existing,
    updatedAt: now,
    messages: cappedMessages,
  };

  const threadPath = getThreadPath(repoRoot, threadId);
  await writeFile(threadPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/**
 * Lists all threads, sorted by updatedAt descending (most recent first).
 */
export async function listThreads(repoRoot: string): Promise<readonly ThreadSummary[]> {
  const threadsDir = getThreadsDir(repoRoot);
  if (!existsSync(threadsDir)) {
    return [];
  }

  try {
    const files = await readdir(threadsDir);
    const threadFiles = files.filter((file) => file.endsWith('.json'));
    
    const threads: ThreadSummary[] = [];
    for (const file of threadFiles) {
      const threadId = file.replace('.json', '');
      const thread = await loadThread(repoRoot, threadId);
      if (thread !== undefined) {
        threads.push({
          id: thread.id,
          title: extractTitle(thread.messages),
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
        });
      }
    }

    // Sort by updatedAt descending (most recent first)
    threads.sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

    return threads;
  } catch {
    return [];
  }
}

/**
 * Deletes a thread by ID. Returns true if the thread was deleted, false if it didn't exist.
 * Validates threadId to prevent path traversal attacks.
 */
export async function deleteThread(
  repoRoot: string,
  threadId: string,
): Promise<boolean> {
  // Validate threadId to prevent path traversal
  if (threadId.includes('..') || threadId.includes('/') || threadId.includes('\\')) {
    return false;
  }

  const threadPath = getThreadPath(repoRoot, threadId);
  if (!existsSync(threadPath)) {
    return false;
  }

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(threadPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds context string from recent thread messages (last N exchanges).
 * Caps total character length to MAX_THREAD_CONTEXT_CHARS, preferring newest messages.
 * Returns empty string if thread not found or has no messages.
 * 
 * Strategy:
 * - Fill budget from newest→oldest (prefer recent context)
 * - Try to keep complete user+assistant pairs
 * - Truncate individual huge messages with …[truncado] marker
 * - Emit final output in chronological order (oldest→newest)
 */
export async function buildThreadContext(
  repoRoot: string,
  threadId: string,
  lastNExchanges = 5,
): Promise<string> {
  const thread = await loadThread(repoRoot, threadId);
  if (thread === undefined || thread.messages.length === 0) {
    return '';
  }

  // Take last N*2 messages (each exchange is user + assistant)
  const recentMessages = thread.messages.slice(-(lastNExchanges * 2));
  
  const header = '## Contexto de conversación reciente\n';
  let budget = MAX_THREAD_CONTEXT_CHARS - header.length;
  
  // Build list of messages to include, working newest→oldest
  // Strategy: prefer complete pairs, but allow the newest message to be orphaned
  const included: Array<{ role: string; content: string }> = [];
  let isFirstMessage = true;
  
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg === undefined) continue;
    
    const role = msg.role === 'user' ? 'Usuario' : 'Asistente';
    let content = msg.content;
    
    // Truncate huge messages to avoid consuming entire budget
    if (content.length > MAX_SINGLE_MESSAGE_CHARS) {
      content = content.slice(0, MAX_SINGLE_MESSAGE_CHARS) + '…[truncado]';
    }
    
    // Format as it will appear in output
    const formatted = `**${role}:** ${content}\n\n`;
    const needed = formatted.length;
    
    // If this message doesn't fit at all, stop including more
    if (needed > budget) {
      // If this is the very first message, try truncating it further
      // so we include at least something
      if (isFirstMessage && content.length > 100) {
        const truncated = content.slice(0, 100) + '…[truncado]';
        const fallbackFormatted = `**${role}:** ${truncated}\n\n`;
        if (fallbackFormatted.length <= budget) {
          included.push({ role, content: truncated });
          budget -= fallbackFormatted.length;
        }
      }
      // Stop trying to include older messages
      break;
    }
    
    // Try to keep complete exchanges: check if the previous message (older) forms a pair
    const prevMsg = recentMessages[i - 1];
    let canIncludeAsPair = false;
    let prevRole = '';
    let prevContent = '';
    let prevNeeded = 0;
    
    if (prevMsg !== undefined && i > 0) {
      prevRole = prevMsg.role === 'user' ? 'Usuario' : 'Asistente';
      prevContent = prevMsg.content;
      
      // Truncate if needed
      if (prevContent.length > MAX_SINGLE_MESSAGE_CHARS) {
        prevContent = prevContent.slice(0, MAX_SINGLE_MESSAGE_CHARS) + '…[truncado]';
      }
      
      const prevFormatted = `**${prevRole}:** ${prevContent}\n\n`;
      prevNeeded = prevFormatted.length;
      
      // Check if this forms a valid pair and both fit
      if (((msg.role === 'assistant' && prevMsg.role === 'user') ||
           (msg.role === 'user' && prevMsg.role === 'assistant')) &&
          needed + prevNeeded <= budget) {
        canIncludeAsPair = true;
      }
    }
    
    if (canIncludeAsPair) {
      // Include both messages as a pair
      included.push({ role, content });
      included.push({ role: prevRole, content: prevContent });
      budget -= (needed + prevNeeded);
      i--; // Skip the message we just included as part of the pair
      isFirstMessage = false;
    } else if (isFirstMessage) {
      // For the very first (newest) message, allow it to be orphaned
      included.push({ role, content });
      budget -= needed;
      isFirstMessage = false;
    } else {
      // For older messages, if we can't include as a complete pair, stop
      break;
    }
  }
  
  // Reverse to get chronological order (oldest→newest)
  included.reverse();
  
  // Build final string
  const lines: string[] = [header];
  for (const { role, content } of included) {
    lines.push(`**${role}:** ${content}\n\n`);
  }
  
  return lines.join('\n');
}

function isValidThread(value: unknown): value is Thread {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string' &&
    Array.isArray(obj.messages) &&
    obj.messages.every(isValidMessage)
  );
}

function isValidMessage(value: unknown): value is ThreadMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    (obj.role === 'user' || obj.role === 'assistant') &&
    typeof obj.content === 'string' &&
    typeof obj.timestamp === 'string'
  );
}
