/**
 * In-memory store for pending --force confirmations (dashboard + Telegram).
 * Each pending entry has a TTL (default 10 minutes).
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export interface PendingForceEntry {
  readonly prompt: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const dashboardPending = new Map<string, PendingForceEntry>();
const telegramPending = new Map<number, PendingForceEntry>();

/**
 * Creates a pending confirmation for the dashboard (single entry per dashboard).
 */
export function setPendingDashboardForce(prompt: string, ttlMs = DEFAULT_TTL_MS): void {
  const now = Date.now();
  dashboardPending.set('dashboard', {
    prompt,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Retrieves and removes the pending dashboard confirmation if it exists and hasn't expired.
 */
export function consumePendingDashboardForce(): string | undefined {
  const entry = dashboardPending.get('dashboard');
  if (entry === undefined) {
    return undefined;
  }
  dashboardPending.delete('dashboard');
  if (Date.now() > entry.expiresAt) {
    return undefined;
  }
  return entry.prompt;
}

/**
 * Checks if there's a pending dashboard confirmation (without consuming it).
 */
export function hasPendingDashboardForce(): boolean {
  const entry = dashboardPending.get('dashboard');
  if (entry === undefined) {
    return false;
  }
  if (Date.now() > entry.expiresAt) {
    dashboardPending.delete('dashboard');
    return false;
  }
  return true;
}

/**
 * Cancels the pending dashboard confirmation.
 */
export function cancelPendingDashboardForce(): void {
  dashboardPending.delete('dashboard');
}

/**
 * Creates a pending confirmation for a Telegram chat.
 */
export function setPendingTelegramForce(chatId: number, prompt: string, ttlMs = DEFAULT_TTL_MS): void {
  const now = Date.now();
  telegramPending.set(chatId, {
    prompt,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Retrieves and removes the pending Telegram confirmation if it exists and hasn't expired.
 */
export function consumePendingTelegramForce(chatId: number): string | undefined {
  const entry = telegramPending.get(chatId);
  if (entry === undefined) {
    return undefined;
  }
  telegramPending.delete(chatId);
  if (Date.now() > entry.expiresAt) {
    return undefined;
  }
  return entry.prompt;
}

/**
 * Checks if there's a pending Telegram confirmation for a chat (without consuming it).
 */
export function hasPendingTelegramForce(chatId: number): boolean {
  const entry = telegramPending.get(chatId);
  if (entry === undefined) {
    return false;
  }
  if (Date.now() > entry.expiresAt) {
    telegramPending.delete(chatId);
    return false;
  }
  return true;
}

/**
 * Cancels the pending Telegram confirmation for a chat.
 */
export function cancelPendingTelegramForce(chatId: number): void {
  telegramPending.delete(chatId);
}

/**
 * Clears all expired entries (both dashboard and Telegram).
 * Called periodically to avoid unbounded memory growth.
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  for (const [key, entry] of dashboardPending.entries()) {
    if (now > entry.expiresAt) {
      dashboardPending.delete(key);
    }
  }
  
  for (const [chatId, entry] of telegramPending.entries()) {
    if (now > entry.expiresAt) {
      telegramPending.delete(chatId);
    }
  }
}
