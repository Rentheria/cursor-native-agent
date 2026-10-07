import type { LaunchProposal } from './proposal.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export interface PendingLaunchEntry {
  readonly proposal: LaunchProposal;
  readonly threadId?: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const dashboardPending = new Map<string, PendingLaunchEntry>();
const replPending = new Map<string, PendingLaunchEntry>();

export function setPendingDashboardLaunch(
  proposal: LaunchProposal,
  threadId?: string,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  dashboardPending.set('dashboard', {
    proposal,
    ...(threadId !== undefined ? { threadId } : {}),
    createdAt: now,
    expiresAt: now + ttlMs,
  });
}

export function consumePendingDashboardLaunch(): PendingLaunchEntry | undefined {
  return consume(dashboardPending, 'dashboard');
}

export function hasPendingDashboardLaunch(): boolean {
  return peek(dashboardPending, 'dashboard') !== undefined;
}

export function cancelPendingDashboardLaunch(): void {
  dashboardPending.delete('dashboard');
}

export function setPendingReplLaunch(
  key: string,
  proposal: LaunchProposal,
  threadId?: string,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  replPending.set(key, {
    proposal,
    ...(threadId !== undefined ? { threadId } : {}),
    createdAt: now,
    expiresAt: now + ttlMs,
  });
}

export function consumePendingReplLaunch(key: string): PendingLaunchEntry | undefined {
  return consume(replPending, key);
}

export function hasPendingReplLaunch(key: string): boolean {
  return peek(replPending, key) !== undefined;
}

export function cancelPendingReplLaunch(key: string): void {
  replPending.delete(key);
}

function peek(
  map: Map<string, PendingLaunchEntry>,
  key: string,
): PendingLaunchEntry | undefined {
  const entry = map.get(key);
  if (entry === undefined) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry;
}

function consume(
  map: Map<string, PendingLaunchEntry>,
  key: string,
): PendingLaunchEntry | undefined {
  const entry = peek(map, key);
  map.delete(key);
  return entry;
}
