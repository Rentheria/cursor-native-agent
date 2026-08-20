import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  MEMORY_DIRECTORY_NAME,
  MEMORY_INDEX_FILE_NAME,
  SKILLS_DIRECTORY_NAME,
} from '../lib/constants.js';
import { parseFrontmatter } from '../loaders/frontmatter.js';
import { parseMemoryIndex } from '../loaders/memory-loader.js';

const execFileAsync = promisify(execFile);

/** Where the last tick's snapshot is persisted so the next tick can diff it. */
export const CRON_HEALTH_STATE_RELATIVE_PATH = 'logs/cron-health.json';

export type HealthSeverity = 'error' | 'warn';

/**
 * One concrete problem found in the repo. `id` is stable across ticks so two
 * snapshots can be diffed (new / resolved / changed).
 */
export interface HealthIssue {
  readonly id: string;
  readonly severity: HealthSeverity;
  readonly message: string;
}

/** A markdown document the agent depends on, plus why it fails to load (if it does). */
export interface DocumentFact {
  readonly relativePath: string;
  /** `null` when the document parses and has every required frontmatter key. */
  readonly loadError: string | null;
}

/** Raw facts read from git and disk. No judgement applied yet. */
export interface RepoFacts {
  readonly branch: string;
  readonly head: string;
  readonly dirtyPaths: readonly string[];
  /** Why git could not be read here, if it could not. */
  readonly gitError: string | null;
  /** `memory/*.md` paths referenced by `MEMORY.md`. */
  readonly indexedMemoryPaths: readonly string[];
  readonly memoryDocuments: readonly DocumentFact[];
  readonly skillDocuments: readonly DocumentFact[];
}

/** Facts + the issues derived from them at a point in time. */
export interface RepoHealthSnapshot extends RepoFacts {
  readonly collectedAt: string;
  readonly issues: readonly HealthIssue[];
}

export interface HealthDelta {
  readonly previousCollectedAt: string | null;
  readonly previousHead: string | null;
  readonly headChanged: boolean;
  readonly newIssues: readonly HealthIssue[];
  readonly resolvedIssues: readonly HealthIssue[];
  /** Same `id` as last tick, different message (e.g. the dirty path count moved). */
  readonly changedIssues: readonly HealthIssue[];
}

/**
 * Reads the live state of the repo: git position, the memory index, every
 * memory detail and skill document. This is the work the tick actually does —
 * the agent is asked to triage the result, not to invent it.
 */
export async function collectRepoFacts(repoRoot: string): Promise<RepoFacts> {
  return {
    ...(await collectGitFacts(repoRoot)),
    indexedMemoryPaths: await readIndexedMemoryPaths(repoRoot),
    memoryDocuments: await inspectDocuments(
      repoRoot,
      MEMORY_DIRECTORY_NAME,
      MEMORY_REQUIRED_KEYS,
    ),
    skillDocuments: await inspectDocuments(
      repoRoot,
      SKILLS_DIRECTORY_NAME,
      SKILL_REQUIRED_KEYS,
    ),
  };
}

export async function collectRepoHealth(
  repoRoot: string,
  now: Date = new Date(),
): Promise<RepoHealthSnapshot> {
  const facts = await collectRepoFacts(repoRoot);
  return {
    ...facts,
    collectedAt: now.toISOString(),
    issues: evaluateRepoHealth(facts),
  };
}

/** Pure rules over the collected facts, sorted errors-first for readability. */
export function evaluateRepoHealth(facts: RepoFacts): readonly HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (facts.gitError !== null) {
    issues.push({
      id: 'git-unavailable',
      severity: 'error',
      message: `cannot read git state: ${facts.gitError}`,
    });
  }

  const presentMemoryPaths = new Set(
    facts.memoryDocuments.map((document) => document.relativePath),
  );
  const indexedMemoryPaths = new Set(facts.indexedMemoryPaths);

  for (const indexedPath of facts.indexedMemoryPaths) {
    if (!presentMemoryPaths.has(indexedPath)) {
      issues.push({
        id: `memory-index-broken-link:${indexedPath}`,
        severity: 'error',
        message: `${MEMORY_INDEX_FILE_NAME} links ${indexedPath}, but that file does not exist`,
      });
    }
  }

  for (const document of facts.memoryDocuments) {
    if (!indexedMemoryPaths.has(document.relativePath)) {
      issues.push({
        id: `memory-unindexed:${document.relativePath}`,
        severity: 'warn',
        message: `${document.relativePath} is not listed in ${MEMORY_INDEX_FILE_NAME}, so it can never be lazy-loaded`,
      });
    }
  }

  for (const document of [...facts.memoryDocuments, ...facts.skillDocuments]) {
    if (document.loadError !== null) {
      issues.push({
        id: `document-unloadable:${document.relativePath}`,
        severity: 'error',
        message: `${document.relativePath} fails to load: ${document.loadError}`,
      });
    }
  }

  if (facts.dirtyPaths.length > 0) {
    issues.push({
      id: 'git-dirty',
      severity: 'warn',
      message: `working tree is dirty: ${String(facts.dirtyPaths.length)} path(s) uncommitted`,
    });
  }

  return issues.toSorted(compareIssues);
}

export function countIssuesBySeverity(issues: readonly HealthIssue[]): {
  readonly errors: number;
  readonly warnings: number;
} {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warn').length,
  };
}

export function diffRepoHealth(
  previous: RepoHealthSnapshot | null,
  current: RepoHealthSnapshot,
): HealthDelta {
  if (previous === null) {
    return {
      previousCollectedAt: null,
      previousHead: null,
      headChanged: false,
      newIssues: current.issues,
      resolvedIssues: [],
      changedIssues: [],
    };
  }

  const before = new Map(previous.issues.map((issue) => [issue.id, issue]));
  const after = new Map(current.issues.map((issue) => [issue.id, issue]));

  return {
    previousCollectedAt: previous.collectedAt,
    previousHead: previous.head,
    headChanged: previous.head !== current.head,
    newIssues: current.issues.filter((issue) => !before.has(issue.id)),
    resolvedIssues: previous.issues.filter((issue) => !after.has(issue.id)),
    changedIssues: current.issues.filter((issue) => {
      const previousIssue = before.get(issue.id);
      return previousIssue !== undefined && previousIssue.message !== issue.message;
    }),
  };
}

/** Human-readable delta lines; always says something, even on the first tick. */
export function describeHealthDelta(delta: HealthDelta): readonly string[] {
  if (delta.previousCollectedAt === null) {
    return ['first tick on this machine — no previous snapshot to compare against'];
  }

  const lines: string[] = [];
  if (delta.headChanged) {
    lines.push(`head moved from "${delta.previousHead ?? '(unknown)'}"`);
  }
  for (const issue of delta.newIssues) {
    lines.push(`new [${issue.severity}] ${issue.message}`);
  }
  for (const issue of delta.resolvedIssues) {
    lines.push(`resolved [${issue.severity}] ${issue.message}`);
  }
  for (const issue of delta.changedIssues) {
    lines.push(`changed [${issue.severity}] ${issue.message}`);
  }

  if (lines.length === 0) {
    lines.push(`no change since ${delta.previousCollectedAt}`);
  }
  return lines;
}

/** The block handed to `cursor-agent` as evidence to triage. */
export function formatHealthReport(
  snapshot: RepoHealthSnapshot,
  delta: HealthDelta,
): string {
  const counts = countIssuesBySeverity(snapshot.issues);
  const lines = [
    `collected: ${snapshot.collectedAt}`,
    `branch:    ${snapshot.branch}`,
    `head:      ${snapshot.head}`,
    `tree:      ${describeTree(snapshot.dirtyPaths)}`,
    `memory:    ${String(snapshot.indexedMemoryPaths.length)} indexed / ${String(snapshot.memoryDocuments.length)} file(s) on disk`,
    `skills:    ${String(snapshot.skillDocuments.length)} file(s)`,
    `issues:    ${String(snapshot.issues.length)} (${String(counts.errors)} error, ${String(counts.warnings)} warn)`,
  ];

  for (const issue of snapshot.issues) {
    lines.push(`  - [${issue.severity}] ${issue.message}`);
  }

  lines.push('changes since previous tick:');
  for (const line of describeHealthDelta(delta)) {
    lines.push(`  - ${line}`);
  }

  if (snapshot.dirtyPaths.length > 0) {
    lines.push('git status --short:');
    for (const dirtyPath of snapshot.dirtyPaths) {
      lines.push(`  ${dirtyPath}`);
    }
  }

  return lines.join('\n');
}

export async function readPreviousSnapshot(
  repoRoot: string,
): Promise<RepoHealthSnapshot | null> {
  try {
    const raw = await readFile(
      path.join(repoRoot, CRON_HEALTH_STATE_RELATIVE_PATH),
      'utf8',
    );
    return parseSnapshot(raw);
  } catch {
    return null;
  }
}

export async function writeSnapshot(
  repoRoot: string,
  snapshot: RepoHealthSnapshot,
): Promise<void> {
  const filePath = path.join(repoRoot, CRON_HEALTH_STATE_RELATIVE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

/** Tolerant reader: a corrupt or outdated state file just means "first tick". */
export function parseSnapshot(raw: string): RepoHealthSnapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }

  const collectedAt = value['collectedAt'];
  const branch = value['branch'];
  const head = value['head'];
  if (
    typeof collectedAt !== 'string' ||
    typeof branch !== 'string' ||
    typeof head !== 'string'
  ) {
    return null;
  }

  const gitError = value['gitError'];

  return {
    collectedAt,
    branch,
    head,
    gitError: typeof gitError === 'string' ? gitError : null,
    dirtyPaths: readStringArray(value['dirtyPaths']),
    indexedMemoryPaths: readStringArray(value['indexedMemoryPaths']),
    memoryDocuments: readDocumentArray(value['memoryDocuments']),
    skillDocuments: readDocumentArray(value['skillDocuments']),
    issues: readIssueArray(value['issues']),
  };
}

const MEMORY_REQUIRED_KEYS = ['name', 'description'] as const;
const SKILL_REQUIRED_KEYS = ['name', 'description', 'triggers'] as const;

async function readIndexedMemoryPaths(
  repoRoot: string,
): Promise<readonly string[]> {
  try {
    const indexMarkdown = await readFile(
      path.join(repoRoot, MEMORY_INDEX_FILE_NAME),
      'utf8',
    );
    return parseMemoryIndex(indexMarkdown).map((entry) => entry.relativePath);
  } catch {
    return [];
  }
}

/**
 * Lists `<directory>/*.md` and records, per file, whether it would load — the
 * same required frontmatter the skills/memory loaders enforce at turn time.
 */
async function inspectDocuments(
  repoRoot: string,
  directoryName: string,
  requiredKeys: readonly string[],
): Promise<readonly DocumentFact[]> {
  let fileNames: readonly string[];
  try {
    const entries = await readdir(path.join(repoRoot, directoryName), {
      withFileTypes: true,
    });
    fileNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }

  const documents: DocumentFact[] = [];
  for (const fileName of fileNames) {
    const relativePath = `${directoryName}/${fileName}`;
    documents.push({
      relativePath,
      loadError: await describeLoadError(
        path.join(repoRoot, directoryName, fileName),
        requiredKeys,
      ),
    });
  }
  return documents;
}

async function describeLoadError(
  filePath: string,
  requiredKeys: readonly string[],
): Promise<string | null> {
  let attributes: Readonly<Record<string, unknown>>;
  try {
    ({ attributes } = parseFrontmatter(await readFile(filePath, 'utf8')));
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  const missing = requiredKeys.filter((key) => {
    const value = attributes[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  return missing.length === 0
    ? null
    : `missing frontmatter ${missing.map((key) => `"${key}"`).join(', ')}`;
}

export function describeTree(dirtyPaths: readonly string[]): string {
  return dirtyPaths.length === 0
    ? 'clean'
    : `dirty (${String(dirtyPaths.length)} path(s))`;
}

function compareIssues(left: HealthIssue, right: HealthIssue): number {
  if (left.severity !== right.severity) {
    return left.severity === 'error' ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

function splitLines(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
}

/**
 * Git is the tick's trigger, so a git failure is a finding in its own right —
 * never a fake "dirty path" or an empty-but-clean-looking tree.
 */
async function collectGitFacts(repoRoot: string): Promise<{
  readonly branch: string;
  readonly head: string;
  readonly dirtyPaths: readonly string[];
  readonly gitError: string | null;
}> {
  try {
    const statusShort = await runGit(repoRoot, ['status', '--short']);
    const branch = await runGit(repoRoot, ['branch', '--show-current']);
    // An empty repo has no HEAD yet; that is not a git failure.
    const head = await runGit(repoRoot, ['log', '-1', '--format=%h %s']).catch(
      () => '',
    );

    return {
      branch: branch === '' ? '(detached)' : branch,
      head: head === '' ? '(no commits)' : head,
      dirtyPaths: splitLines(statusShort),
      gitError: null,
    };
  } catch (error: unknown) {
    return {
      branch: '(unknown)',
      head: '(unknown)',
      dirtyPaths: [],
      gitError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runGit(
  repoRoot: string,
  args: readonly string[],
): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return stdout.trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readDocumentArray(value: unknown): readonly DocumentFact[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const documents: DocumentFact[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['relativePath'] !== 'string') {
      continue;
    }
    const loadError = item['loadError'];
    documents.push({
      relativePath: item['relativePath'],
      loadError: typeof loadError === 'string' ? loadError : null,
    });
  }
  return documents;
}

function readIssueArray(value: unknown): readonly HealthIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const issues: HealthIssue[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['message'] !== 'string' ||
      (item['severity'] !== 'error' && item['severity'] !== 'warn')
    ) {
      continue;
    }
    issues.push({
      id: item['id'],
      severity: item['severity'],
      message: item['message'],
    });
  }
  return issues;
}
