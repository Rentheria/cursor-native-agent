export const SKILLS_DIRECTORY_NAME = 'skills';
export const MEMORY_DIRECTORY_NAME = 'memory';
export const MEMORY_INDEX_FILE_NAME = 'MEMORY.md';
export const WORKER_LOGS_DIRECTORY_NAME = 'logs/workers';
export const WORKSPACE_DIRECTORY_NAME = 'workspace';
export const CURSOR_AGENT_BINARY = 'cursor-agent';
/** Env override for absolute binary path — see `resolveCursorAgentBinary`. */
export const CURSOR_AGENT_BIN_PATH_ENV = 'CURSOR_AGENT_BIN_PATH';
/** Env override for model: when set and not empty/auto, passes `--model <id>` to cursor-agent. */
export const CURSOR_AGENT_MODEL_ENV = 'CURSOR_AGENT_MODEL';
/** Env override for workspace path: where user projects are built. */
export const WORKSPACE_PATH_ENV = 'WORKSPACE_PATH';
export const CURSOR_AGENT_PRINT_FLAG = '-p';
export const CURSOR_AGENT_FORCE_FLAG = '--force';
export const CURSOR_AGENT_TRUST_FLAG = '--trust';
/** Env override for cursor-agent timeout in milliseconds. Default: 240000 (4 minutes). */
export const CURSOR_AGENT_TIMEOUT_ENV = 'CURSOR_AGENT_TIMEOUT_MS';
/** Default timeout for cursor-agent runs: 4 minutes. */
export const DEFAULT_CURSOR_AGENT_TIMEOUT_MS = 240_000;

/** Minimum token length when splitting description text into match keywords. */
export const MIN_KEYWORD_LENGTH = 3;

/**
 * Semantic memory (local TF-IDF by default). Env overrides:
 * - CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY=0 to disable
 * - CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K / _THRESHOLD for ranking knobs
 */
export const DEFAULT_SEMANTIC_TOP_K = 3;
export const DEFAULT_SEMANTIC_THRESHOLD = 0.12;
export const SEMANTIC_MEMORY_ENV = 'CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY';
export const SEMANTIC_TOP_K_ENV = 'CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K';
export const SEMANTIC_THRESHOLD_ENV = 'CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD';

/**
 * Semantic skill matching (local TF-IDF fallback when exact triggers miss).
 * Uses SEMANTIC_TOP_K_ENV and SEMANTIC_THRESHOLD_ENV for ranking knobs.
 * - CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS=0 to disable fallback
 */
export const SEMANTIC_SKILLS_ENV = 'CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS';

/** Words ignored when deriving keywords from skill/memory descriptions. */
export const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'when',
  'use',
  'using',
  'into',
  'your',
  'you',
  'are',
  'has',
  'have',
  'will',
  'can',
  'how',
  'what',
  'which',
  'about',
  'also',
  'una',
  'uno',
  'los',
  'las',
  'del',
  'con',
  'por',
  'para',
  'que',
  'como',
  'sobre',
  'este',
  'esta',
]);
