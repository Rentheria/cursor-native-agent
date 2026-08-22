import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const THREADS_DIR_NAME = 'threads';
export const MAX_MESSAGES_PER_THREAD = 50;

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
 * Appends a message to an existing thread. Returns the updated thread.
 */
export async function appendToThread(
  repoRoot: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<Thread> {
  const existing = await loadThread(repoRoot, threadId);
  if (existing === undefined) {
    throw new Error(`Thread ${threadId} not found`);
  }

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
 * Builds context string from recent thread messages (last N exchanges).
 * Returns empty string if thread not found or has no messages.
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
  
  const lines: string[] = ['## Contexto de conversación reciente\n'];
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'Usuario' : 'Asistente';
    lines.push(`**${role}:** ${msg.content}\n`);
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
