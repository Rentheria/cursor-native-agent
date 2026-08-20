/**
 * Dense embedding backend. Used by real/remote providers and by the cosine
 * wrapper around them. The default local path uses {@link SemanticRanker}
 * (TF-IDF) instead, because IDF needs the full document batch.
 */
export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

/**
 * Ranks documents against a query. Scores are cosine-like similarities in
 * `[0, 1]` when vectors are L2-normalized (higher = more relevant).
 */
export interface SemanticRanker {
  readonly id: string;
  rank(
    query: string,
    documents: readonly string[],
  ): Promise<readonly number[]>;
}

/** Factory shape expected from a custom embeddings module (extension point). */
export interface EmbeddingProviderModule {
  createEmbeddingProvider: () => EmbeddingProvider | Promise<EmbeddingProvider>;
}
