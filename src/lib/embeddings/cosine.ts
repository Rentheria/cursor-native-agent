/**
 * Cosine similarity of two equal-length vectors.
 * Returns 0 when either vector has zero magnitude.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** In-place L2 normalize; zero vectors stay zero. */
export function l2NormalizeInPlace(vector: number[]): void {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  if (sumSquares === 0) {
    return;
  }
  const scale = 1 / Math.sqrt(sumSquares);
  for (let i = 0; i < vector.length; i++) {
    vector[i] = (vector[i] ?? 0) * scale;
  }
}

/**
 * Builds a {@link import('./types.js').SemanticRanker} that embeds the query
 * and each document, then scores with cosine similarity.
 */
export function createCosineRankerFromEmbeddings(
  provider: import('./types.js').EmbeddingProvider,
): import('./types.js').SemanticRanker {
  return {
    id: `cosine:${provider.id}`,
    async rank(query, documents) {
      if (documents.length === 0) {
        return [];
      }
      const vectors = await provider.embed([query, ...documents]);
      const queryVector = vectors[0];
      if (queryVector === undefined) {
        return documents.map(() => 0);
      }
      return documents.map((_, index) => {
        const docVector = vectors[index + 1];
        if (docVector === undefined) {
          return 0;
        }
        return cosineSimilarity(queryVector, docVector);
      });
    },
  };
}
