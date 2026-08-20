import {
  DEFAULT_SEMANTIC_THRESHOLD,
  DEFAULT_SEMANTIC_TOP_K,
  SEMANTIC_MEMORY_ENV,
  SEMANTIC_THRESHOLD_ENV,
  SEMANTIC_TOP_K_ENV,
} from '../lib/constants.js';
import { resolveSemanticRanker } from '../lib/embeddings/resolve-provider.js';
import type { SemanticRanker } from '../lib/embeddings/types.js';
import type {
  MemoryDetailDocument,
  MemoryIndexEntry,
} from '../lib/types.js';

export interface SemanticMemoryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly ranker?: SemanticRanker;
  readonly topK?: number;
  readonly threshold?: number;
  readonly enabled?: boolean;
}

export interface SemanticHit {
  readonly detail: MemoryDetailDocument;
  readonly score: number;
}

/**
 * Builds the searchable text for a memory detail (index hooks + body).
 * Body is included so paraphrases can match when index keywords do not.
 */
export function buildMemorySearchText(
  detail: MemoryDetailDocument,
  indexEntries: readonly MemoryIndexEntry[],
): string {
  const indexEntry = indexEntries.find(
    (entry) => entry.relativePath === detail.relativeLink,
  );
  return [
    detail.name,
    detail.description,
    detail.memoryType,
    indexEntry?.title ?? '',
    indexEntry?.hook ?? '',
    detail.body,
  ].join('\n');
}

export function isSemanticMemoryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env[SEMANTIC_MEMORY_ENV];
  if (flag === undefined || flag.trim() === '') {
    return true;
  }
  const normalized = flag.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no' && normalized !== 'off';
}

export function readSemanticTopK(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env[SEMANTIC_TOP_K_ENV], DEFAULT_SEMANTIC_TOP_K);
}

export function readSemanticThreshold(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[SEMANTIC_THRESHOLD_ENV]?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_SEMANTIC_THRESHOLD;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_SEMANTIC_THRESHOLD;
  }
  return value;
}

/**
 * Ranks catalog entries by semantic similarity and returns the top hits above
 * the threshold. Callers typically exclude already keyword-matched details.
 */
export async function selectSemanticMemoryDetails(
  prompt: string,
  catalog: readonly MemoryDetailDocument[],
  indexEntries: readonly MemoryIndexEntry[],
  options: SemanticMemoryOptions = {},
): Promise<readonly SemanticHit[]> {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? isSemanticMemoryEnabled(env);
  if (!enabled || catalog.length === 0 || prompt.trim() === '') {
    return [];
  }

  const topK = options.topK ?? readSemanticTopK(env);
  const threshold = options.threshold ?? readSemanticThreshold(env);
  const ranker = options.ranker ?? (await resolveSemanticRanker(env));
  const documents = catalog.map((detail) =>
    buildMemorySearchText(detail, indexEntries),
  );
  const scores = await ranker.rank(prompt, documents);

  const hits: SemanticHit[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const detail = catalog[i];
    const score = scores[i] ?? 0;
    if (detail === undefined || score < threshold) {
      continue;
    }
    hits.push({ detail, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return value;
}
