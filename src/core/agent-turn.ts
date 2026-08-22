import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getCannedPitch } from './canned-pitch.js';
import { runCursorAgent, type CursorAgentRunResult } from './cursor-agent.js';
import {
  buildTurnDebugReport,
  isDebugEnabled,
  printTurnDebug,
  appendAgentNdjson,
  type TurnDebugReport,
} from './debug.js';
import {
  extractDelegationSubtask,
  hasDelegationIntent,
} from './delegation.js';
import { loadMemoryForPrompt } from '../loaders/memory-loader.js';
import { applyMemoryWritesFromText } from '../loaders/memory-writer.js';
import { assemblePrompt } from './prompt-builder.js';
import { loadAllSkills, selectRelevantSkills } from '../loaders/skills-loader.js';
import {
  buildWorkerReportPrompt,
  dispatchWorker,
  type WorkerDispatchResult,
} from '../orchestration/worker-dispatch.js';
import { WORKSPACE_DIRECTORY_NAME, WORKSPACE_PATH_ENV } from '../lib/constants.js';

export type AgentRunner = (options: {
  readonly prompt: string;
  readonly cwd?: string;
  readonly force?: boolean;
  readonly trust?: boolean;
  readonly streamJson?: boolean;
  readonly onAssistantDelta?: (text: string) => void;
}) => Promise<CursorAgentRunResult>;

export type WorkerDispatcher = (options: {
  readonly ref: string;
  readonly prompt: string;
  readonly repoRoot: string;
}) => Promise<WorkerDispatchResult>;

export interface AgentTurnResult {
  /** Cleaned model reply (MEMORY_WRITE blocks stripped). */
  readonly reply: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface AgentTurnOptions {
  readonly repoRoot: string;
  readonly userPrompt: string;
  readonly debug?: boolean;
  /** Injected for tests; defaults to real `runCursorAgent`. */
  readonly runAgent?: AgentRunner;
  /** Injected for tests; defaults to real `dispatchWorker`. */
  readonly runWorker?: WorkerDispatcher;
  /**
   * Opt-in streaming: pass stream-json flags to cursor-agent and emit
   * assistant text deltas via `onAssistantDelta`. Default off (CLI/telegram/cron).
   */
  readonly stream?: boolean;
  readonly onAssistantDelta?: (text: string) => void;
  /**
   * When true, use repoRoot as cwd, do not pass --force, and pass --trust.
   * Used by dashboard chat to avoid blindly forcing arbitrary prompts against
   * the wrapper repo while still trusting cursor-agent's own tooling.
   */
  readonly safeMode?: boolean;
}

/**
 * Resolves the workspace path from env or defaults to repoRoot/workspace.
 */
function resolveWorkspacePath(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envPath = env[WORKSPACE_PATH_ENV];
  if (envPath !== undefined && envPath.trim() !== '') {
    return path.isAbsolute(envPath) ? envPath : path.resolve(repoRoot, envPath);
  }
  return path.join(repoRoot, WORKSPACE_DIRECTORY_NAME);
}

/**
 * Same pipeline as `npm run agent`: skills + memory (+ optional delegation) →
 * `cursor-agent -p`. Shared by the CLI and channel entrypoints.
 */
export async function runAgentTurn(
  options: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const { repoRoot, userPrompt } = options;
  const debug = options.debug === true;
  const runAgent = options.runAgent ?? runCursorAgent;
  const totalStart = performance.now();
  let cursorAgentMs = 0;
  let report: TurnDebugReport | undefined;

  if (userPrompt.trim() === '') {
    throw new Error('Empty prompt.');
  }

  try {
    console.error('[agent] Loading skills…');
    const skills = await loadAllSkills(repoRoot);
    const matchedSkills = await selectRelevantSkills(userPrompt, skills);
    console.error(
      `[agent] Skills loaded: ${skills.length}; matched: ${
        matchedSkills.map((skill) => skill.name).join(', ') || '(none)'
      }`,
    );

    const hasStagePitch = matchedSkills.some((skill) => skill.name === 'stage-pitch');
    if (hasStagePitch) {
      console.error('[agent] stage-pitch matched: returning canned pitch (no model call)');
      const cannedReply = getCannedPitch(userPrompt);
      const cannedResult: AgentTurnResult = {
        reply: cannedReply,
        stderr: '',
        exitCode: 0,
      };
      
      const memory = await loadMemoryForPrompt(repoRoot, userPrompt);
      const report = buildTurnDebugReport({
        prompt: userPrompt,
        allSkills: skills,
        matchedSkills,
        memory,
      });
      if (debug) {
        printTurnDebug(report);
      }
      await appendAgentNdjson(repoRoot, {
        ...report,
        cursorAgentMs: 0,
        totalMs: Math.round(performance.now() - totalStart),
        reply: cannedResult.reply,
        exitCode: 0,
      });
      
      return cannedResult;
    }

    const hasGitCommit = matchedSkills.some((skill) => skill.name === 'git-commit');
    if (hasGitCommit && !existsSync(path.join(repoRoot, '.git'))) {
      console.error('[agent] git-commit matched but no .git folder: refusing to init or commit everything');
      const safetyReply = 'No git repository detected. Will not run `git init` or commit the entire tree. Please run this command inside a real git clone.';
      const safetyResult: AgentTurnResult = {
        reply: safetyReply,
        stderr: '',
        exitCode: 0,
      };
      
      const memory = await loadMemoryForPrompt(repoRoot, userPrompt);
      const report = buildTurnDebugReport({
        prompt: userPrompt,
        allSkills: skills,
        matchedSkills,
        memory,
      });
      if (debug) {
        printTurnDebug(report);
      }
      await appendAgentNdjson(repoRoot, {
        ...report,
        cursorAgentMs: 0,
        totalMs: Math.round(performance.now() - totalStart),
        reply: safetyResult.reply,
        exitCode: 0,
      });
      
      return safetyResult;
    }

    console.error('[agent] Loading memory index + relevant details…');
    const memory = await loadMemoryForPrompt(repoRoot, userPrompt);
    console.error(
      `[agent] Memory index entries: ${memory.indexEntries.length}; details loaded: ${
        memory.details.map((detail) => detail.name).join(', ') || '(none)'
      }`,
    );

    report = buildTurnDebugReport({
      prompt: userPrompt,
      allSkills: skills,
      matchedSkills,
      memory,
    });
    if (debug) {
      printTurnDebug(report);
    }

    if (hasDelegationIntent(userPrompt)) {
      const delegated = await runDelegatedTurn({
        repoRoot,
        userPrompt,
        matchedSkills,
        memory,
        runAgent,
        runWorker: options.runWorker ?? dispatchWorker,
        stream: options.stream === true,
        onAssistantDelta: options.onAssistantDelta,
        onCursorAgentMs: (ms) => {
          cursorAgentMs += ms;
        },
      });
      if (report !== undefined) {
        await appendAgentNdjson(repoRoot, {
          ...report,
          cursorAgentMs: Math.round(cursorAgentMs),
          totalMs: Math.round(performance.now() - totalStart),
          reply: delegated.reply,
          exitCode: delegated.exitCode,
        });
      }
      return delegated;
    }

    const assembled = assemblePrompt({
      userPrompt,
      matchedSkills,
      memory,
    });

    const workspacePath = resolveWorkspacePath(repoRoot);
    const isBuildRequest = matchedSkills.some((skill) => skill.name === 'clarify-build');
    const safeMode = options.safeMode === true;
    const useCwd = isBuildRequest ? workspacePath : repoRoot;
    const useForce = !safeMode;
    const useTrust = true;

    if (isBuildRequest) {
      await mkdir(workspacePath, { recursive: true });
      console.error(`[agent] workspace: ${workspacePath}`);
    }

    console.error('[agent] Calling cursor-agent -p …');
    const agentStart = performance.now();
    const result = await runAgent({
      prompt: assembled.finalPrompt,
      cwd: useCwd,
      force: useForce,
      trust: useTrust,
      ...streamRunnerOptions(options.stream === true, options.onAssistantDelta),
    });
    cursorAgentMs += performance.now() - agentStart;
    const reply = await finalizeAgentStdout(repoRoot, result.stdout);
    const turnResult = { reply, stderr: result.stderr, exitCode: result.exitCode };
    if (report !== undefined) {
      await appendAgentNdjson(repoRoot, {
        ...report,
        cursorAgentMs: Math.round(cursorAgentMs),
        totalMs: Math.round(performance.now() - totalStart),
        reply: turnResult.reply,
        exitCode: turnResult.exitCode,
      });
    }
    return turnResult;
  } catch (error: unknown) {
    if (report !== undefined) {
      await appendAgentNdjson(repoRoot, {
        ...report,
        cursorAgentMs: Math.round(cursorAgentMs),
        totalMs: Math.round(performance.now() - totalStart),
        exitCode: 1,
      });
    }
    throw error;
  }
}

async function runDelegatedTurn(params: {
  readonly repoRoot: string;
  readonly userPrompt: string;
  readonly matchedSkills: Awaited<ReturnType<typeof selectRelevantSkills>>;
  readonly memory: Awaited<ReturnType<typeof loadMemoryForPrompt>>;
  readonly runAgent: AgentRunner;
  readonly runWorker: WorkerDispatcher;
  readonly stream: boolean;
  readonly onAssistantDelta: ((text: string) => void) | undefined;
  readonly onCursorAgentMs: (ms: number) => void;
}): Promise<AgentTurnResult> {
  const subtask = extractDelegationSubtask(params.userPrompt);
  if (subtask === '') {
    throw new Error(
      'Delegation intent detected but subtask is empty. Example: "pídele a otro agente que resume MEMORY.md" or "delega esto a un sub-agente: resume MEMORY.md"',
    );
  }

  const ref = `worker-${String(Date.now())}`;
  console.error(`[agent] Dispatching worker ${ref} for subtask: ${subtask}`);

  const worker = await params.runWorker({
    ref,
    prompt: subtask,
    repoRoot: params.repoRoot,
  });

  console.error(
    `[agent] Worker finished exit=${String(worker.exitCode)} log=${worker.logPath}`,
  );

  const reportPrompt = assemblePrompt({
    userPrompt: buildWorkerReportPrompt({
      userPrompt: params.userPrompt,
      subtask,
      worker,
    }),
    matchedSkills: params.matchedSkills,
    memory: params.memory,
  });

  console.error('[agent] Calling parent cursor-agent to report worker result…');
  const agentStart = performance.now();
  const result = await params.runAgent({
    prompt: reportPrompt.finalPrompt,
    cwd: params.repoRoot,
    force: false,
    trust: false,
    ...streamRunnerOptions(params.stream, params.onAssistantDelta),
  });
  params.onCursorAgentMs(performance.now() - agentStart);
  const reply = await finalizeAgentStdout(params.repoRoot, result.stdout);
  const turnResult = { reply, stderr: result.stderr, exitCode: result.exitCode };
  return turnResult;
}

function streamRunnerOptions(
  stream: boolean,
  onAssistantDelta: ((text: string) => void) | undefined,
): {
  readonly streamJson?: true;
  readonly onAssistantDelta?: (text: string) => void;
} {
  if (!stream) {
    return {};
  }
  if (onAssistantDelta === undefined) {
    return { streamJson: true };
  }
  return { streamJson: true, onAssistantDelta };
}

/**
 * Applies any `<<<MEMORY_WRITE…>>>` blocks (remember skill), logs visibly on
 * stderr, and returns stdout with those blocks stripped.
 */
export async function finalizeAgentStdout(
  repoRoot: string,
  stdout: string,
): Promise<string> {
  const { cleanedText, writes } = await applyMemoryWritesFromText(repoRoot, stdout);
  if (writes.length > 0) {
    console.error(
      `[memory] Applied ${String(writes.length)} memory write(s) this turn`,
    );
  }
  return cleanedText;
}

/** Re-export for callers that need the env-based debug flag. */
export { isDebugEnabled };
