import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCursorAgent } from '../core/cursor-agent.js';
import { loadRepoEnv } from '../lib/load-env.js';
import { maybeRunOnboarding } from '../lib/onboarding.js';
import {
  collectRepoHealth,
  countIssuesBySeverity,
  describeHealthDelta,
  describeTree,
  diffRepoHealth,
  formatHealthReport,
  readPreviousSnapshot,
  writeSnapshot,
  type HealthDelta,
  type RepoHealthSnapshot,
} from './repo-health.js';
import { maybeNotifyTelegramCronResult } from './cron-notify.js';

export const CRON_TICK_PROMPT_PREFIX =
  'Autonomous cron tick for cursor-native-agent. Read-only: do not edit files.';

/** Flag that runs the health check alone, without spending a cursor-agent call. */
export const CHECK_ONLY_FLAG = '--check-only';

/** What the agent contributed this tick: a judgement, not a restatement. */
export interface AgentTriage {
  readonly finding: string | undefined;
  readonly action: string | undefined;
}

export interface CronTickReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  /** `undefined` when the tick ran with `--check-only`. */
  readonly exitCode: number | undefined;
  readonly snapshot: RepoHealthSnapshot;
  readonly delta: HealthDelta;
  readonly triage: AgentTriage;
}

/**
 * Asks the agent to triage the health report this tick just produced: which
 * finding matters most, and what to do about it. The evidence is collected
 * fresh every run, so both the prompt and the answer move with the repo.
 */
export function buildCronTickPrompt(
  snapshot: RepoHealthSnapshot,
  delta: HealthDelta,
): string {
  return [
    CRON_TICK_PROMPT_PREFIX,
    '',
    'A health check just ran against the working copy. Triage its output.',
    'Reply with EXACTLY two lines, each under 200 characters:',
    '1. FINDING: <the single most important thing this report says right now>',
    '2. ACTION: <the concrete next step, or "none" if nothing needs doing>',
    'Name the specific file, issue, or change you are reacting to. Do not',
    'restate the whole list, and do not repeat the verdict wording verbatim.',
    '',
    '## Health report (collected by the cron wrapper just now)',
    '',
    formatHealthReport(snapshot, delta),
  ].join('\n');
}

/** Reads the two contract lines out of the agent reply; tolerant of extra prose. */
export function parseAgentTriage(stdout: string): AgentTriage {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  let finding: string | undefined;
  let action: string | undefined;

  for (const line of lines) {
    const findingMatch = /^FINDING:\s*(.+)$/i.exec(line);
    if (findingMatch?.[1] !== undefined && finding === undefined) {
      finding = findingMatch[1].trim();
      continue;
    }
    const actionMatch = /^ACTION:\s*(.+)$/i.exec(line);
    if (actionMatch?.[1] !== undefined && action === undefined) {
      action = actionMatch[1].trim();
    }
  }

  return {
    finding: finding ?? lines[0],
    action,
  };
}

/** Deterministic verdict derived from the checks — the agent triages it, not the reverse. */
export function deriveCronVerdict(snapshot: RepoHealthSnapshot): string {
  const { errors, warnings } = countIssuesBySeverity(snapshot.issues);
  if (errors > 0) {
    return `BROKEN — ${String(errors)} error(s) would break a live turn; fix before stage`;
  }
  if (warnings > 0) {
    return `WARN — ${String(warnings)} warning(s); demoable but not tidy`;
  }
  return 'READY — no issues found; safe to show on stage';
}

/**
 * Scannable block written at the top of `logs/cron.log`, so
 * `tail -n 30 logs/cron.log` is enough for a 30-second demo beat.
 */
export function formatCronFinding(report: CronTickReport): string {
  const { snapshot, delta, triage } = report;
  const counts = countIssuesBySeverity(snapshot.issues);

  // Field names `latest`/`tree`/`note` are the dashboard's contract (see
  // src/dashboard/parse-logs.ts); keep them even as the body grows.
  const lines = [
    `=== CRON FINDING ${report.startedAt} ===`,
    `finished: ${report.finishedAt}`,
    `exit:     ${report.exitCode === undefined ? '(check-only)' : String(report.exitCode)}`,
    `branch:   ${snapshot.branch}`,
    `latest:   ${snapshot.head}`,
    `tree:     ${describeTree(snapshot.dirtyPaths)}`,
    `checked:  ${String(snapshot.memoryDocuments.length)} memory file(s), ${String(snapshot.skillDocuments.length)} skill(s)`,
    `issues:   ${String(snapshot.issues.length)} (${String(counts.errors)} error, ${String(counts.warnings)} warn)`,
  ];

  for (const issue of snapshot.issues) {
    lines.push(`  - [${issue.severity}] ${issue.message}`);
  }

  lines.push('changed:');
  for (const line of describeHealthDelta(delta)) {
    lines.push(`  - ${line}`);
  }

  lines.push(`verdict:  ${deriveCronVerdict(snapshot)}`);
  if (triage.finding !== undefined && triage.finding !== '') {
    lines.push(`note:     ${triage.finding}`);
  }
  if (triage.action !== undefined && triage.action !== '') {
    lines.push(`action:   ${triage.action}`);
  }

  lines.push('===');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  loadRepoEnv(repoRoot);
  await maybeRunOnboarding({ repoRoot, skipOnboarding: true });
  const checkOnly = process.argv.includes(CHECK_ONLY_FLAG);
  const logsDirectory = path.join(repoRoot, 'logs');
  await mkdir(logsDirectory, { recursive: true });

  const startedAt = new Date().toISOString();
  console.error(`[cron] tick start ${startedAt}`);

  console.error('[cron] Running repo health check (git + memory + skills)…');
  const previous = await readPreviousSnapshot(repoRoot);
  const snapshot = await collectRepoHealth(repoRoot);
  const delta = diffRepoHealth(previous, snapshot);
  console.error(
    `[cron] ${String(snapshot.issues.length)} issue(s); ${String(delta.newIssues.length)} new, ${String(delta.resolvedIssues.length)} resolved since last tick`,
  );

  const prompt = buildCronTickPrompt(snapshot, delta);
  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;

  if (checkOnly) {
    console.error(`[cron] ${CHECK_ONLY_FLAG}: skipping cursor-agent triage.`);
  } else {
    console.error('[cron] Calling cursor-agent -p (force+trust, mode=ask)…');
    const result = await runCursorAgent({
      prompt,
      cwd: repoRoot,
      force: true,
      trust: true,
      mode: 'ask',
    });
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
  }

  const finishedAt = new Date().toISOString();
  const finding = formatCronFinding({
    startedAt,
    finishedAt,
    exitCode,
    snapshot,
    delta,
    triage: checkOnly ? { finding: undefined, action: undefined } : parseAgentTriage(stdout),
  });

  const report: CronTickReport = {
    startedAt,
    finishedAt,
    exitCode,
    snapshot,
    delta,
    triage: checkOnly ? { finding: undefined, action: undefined } : parseAgentTriage(stdout),
  };

  // Finding first so `tail` shows the demoable block without scrolling the prompt.
  const logEntry = [
    finding,
    '',
    `--- cron tick transcript ${startedAt} → ${finishedAt} ---`,
    prompt,
    '',
    stdout.trimEnd(),
    stderr.trim() === '' ? '' : `\n[stderr]\n${stderr.trimEnd()}`,
    '',
  ].join('\n');
  await appendFile(path.join(logsDirectory, 'cron.log'), `${logEntry}\n`, 'utf8');

  // Persisted last so a crash mid-tick does not lose the previous baseline.
  await writeSnapshot(repoRoot, snapshot);

  // Send Telegram notification if configured (fail-closed: no token/allowlist → no send, no crash)
  await maybeNotifyTelegramCronResult(report);

  // Also print the finding to stderr so a live `npm run cron` shows it immediately.
  console.error(finding);

  if (stderr.trim() !== '') {
    console.error(stderr.trimEnd());
  }

  process.stdout.write(stdout);
  if (!stdout.endsWith('\n')) {
    process.stdout.write('\n');
  }

  if (exitCode !== undefined && exitCode !== 0) {
    console.error(`[cron] cursor-agent exited with code ${String(exitCode)}`);
    process.exitCode = exitCode;
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] ${message}`);
    process.exitCode = 1;
  });
}
