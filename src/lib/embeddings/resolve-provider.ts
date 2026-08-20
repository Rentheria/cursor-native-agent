import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createCosineRankerFromEmbeddings } from './cosine.js';
import { createLocalTfidfRanker } from './local-tfidf.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderModule,
  SemanticRanker,
} from './types.js';

export const EMBEDDINGS_PROVIDER_ENV = 'CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER';
export const EMBEDDINGS_MODULE_ENV = 'CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE';

type WarnFn = (message: string) => void;

/**
 * Resolves the semantic ranker from env.
 *
 * - unset / `local` / `tfidf` → local TF-IDF (default, no config)
 * - `custom` → dynamic-import `CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE`, which
 *   must export `createEmbeddingProvider()`. On any failure, falls back to local
 *   so missing optional config never breaks the agent.
 */
export async function resolveSemanticRanker(
  env: NodeJS.ProcessEnv = process.env,
  warn: WarnFn = (message) => {
    console.error(message);
  },
): Promise<SemanticRanker> {
  const raw = (env[EMBEDDINGS_PROVIDER_ENV] ?? 'local').trim().toLowerCase();
  const providerName = raw === '' ? 'local' : raw;

  if (providerName === 'local' || providerName === 'tfidf') {
    return createLocalTfidfRanker();
  }

  if (providerName === 'custom') {
    const modulePath = env[EMBEDDINGS_MODULE_ENV]?.trim() ?? '';
    if (modulePath === '') {
      warn(
        `[memory] ${EMBEDDINGS_PROVIDER_ENV}=custom but ${EMBEDDINGS_MODULE_ENV} is unset; using local TF-IDF`,
      );
      return createLocalTfidfRanker();
    }

    try {
      const provider = await loadCustomEmbeddingProvider(modulePath);
      return createCosineRankerFromEmbeddings(provider);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      warn(
        `[memory] Failed to load custom embeddings module "${modulePath}": ${reason}; using local TF-IDF`,
      );
      return createLocalTfidfRanker();
    }
  }

  warn(
    `[memory] Unknown ${EMBEDDINGS_PROVIDER_ENV}="${providerName}"; using local TF-IDF`,
  );
  return createLocalTfidfRanker();
}

async function loadCustomEmbeddingProvider(
  modulePath: string,
): Promise<EmbeddingProvider> {
  const resolved = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(process.cwd(), modulePath);
  const href = pathToFileURL(resolved).href;
  const imported = (await import(href)) as EmbeddingProviderModule;
  if (typeof imported.createEmbeddingProvider !== 'function') {
    throw new Error(
      'module must export createEmbeddingProvider(): EmbeddingProvider',
    );
  }
  return imported.createEmbeddingProvider();
}
