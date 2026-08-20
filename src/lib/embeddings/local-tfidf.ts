import { MIN_KEYWORD_LENGTH, STOP_WORDS } from '../constants.js';
import { tokenize } from '../../loaders/keyword-match.js';
import { cosineSimilarity, l2NormalizeInPlace } from './cosine.js';
import type { SemanticRanker } from './types.js';

const HASH_DIM = 128;
const CHAR_NGRAM = 3;
/** Char n-grams help fuzzy overlap but must stay weak vs word features. */
const HASH_WEIGHT = 0.2;
const BIGRAM_WEIGHT = 1.5;

/**
 * Local, zero-config semantic ranker: TF-IDF over word unigrams/bigrams plus
 * lightly weighted hashed character n-grams. No API key, no network, no native deps.
 */
export function createLocalTfidfRanker(): SemanticRanker {
  return {
    id: 'local-tfidf',
    async rank(query, documents) {
      if (documents.length === 0) {
        return [];
      }

      const corpus = [query, ...documents];
      const featureDocs = corpus.map((text) => extractFeatures(text));
      const documentFrequency = new Map<string, number>();

      for (const features of featureDocs) {
        for (const term of new Set(features.keys())) {
          documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
        }
      }

      const vocab = [...documentFrequency.keys()].toSorted();
      const vocabIndex = new Map(vocab.map((term, index) => [term, index]));
      const docCount = featureDocs.length;
      const vectors = featureDocs.map((features) =>
        toTfidfVector(features, vocabIndex, documentFrequency, docCount),
      );

      const queryVector = vectors[0];
      if (queryVector === undefined) {
        return documents.map(() => 0);
      }

      return documents.map((_, index) => {
        const docVector = vectors[index + 1];
        if (docVector === undefined) {
          return 0;
        }
        // Cosine on L2-normalized TF-IDF; clamp tiny negatives from float noise.
        return Math.max(0, cosineSimilarity(queryVector, docVector));
      });
    },
  };
}

/** Exported for unit tests: bag of weighted term features for one text. */
export function extractFeatures(text: string): Map<string, number> {
  const features = new Map<string, number>();
  const tokens = tokenize(text).filter(
    (token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token),
  );

  for (const token of tokens) {
    bump(features, `w:${token}`, 1);
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (left === undefined || right === undefined) {
      continue;
    }
    bump(features, `b:${left}_${right}`, BIGRAM_WEIGHT);
  }

  // Hash only content-bearing tokens (not the whole string) to cut noise.
  for (const token of tokens) {
    if (token.length < CHAR_NGRAM) {
      continue;
    }
    for (let i = 0; i <= token.length - CHAR_NGRAM; i++) {
      const ngram = token.slice(i, i + CHAR_NGRAM);
      const bucket = hashToBucket(ngram, HASH_DIM);
      bump(features, `h:${String(bucket)}`, HASH_WEIGHT);
    }
  }

  return features;
}

function toTfidfVector(
  features: Map<string, number>,
  vocabIndex: Map<string, number>,
  documentFrequency: Map<string, number>,
  docCount: number,
): number[] {
  const vector = new Array<number>(vocabIndex.size).fill(0);

  for (const [term, rawTf] of features) {
    const index = vocabIndex.get(term);
    if (index === undefined || rawTf <= 0) {
      continue;
    }
    const df = documentFrequency.get(term) ?? 1;
    // Smooth IDF; terms in every doc still get a small weight.
    const idf = Math.log((1 + docCount) / (1 + df)) + 1;
    const sublinearTf = 1 + Math.log(rawTf);
    vector[index] = sublinearTf * idf;
  }

  l2NormalizeInPlace(vector);
  return vector;
}

function bump(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** FNV-1a 32-bit hash → bucket in `[0, dim)`. */
function hashToBucket(value: string, dim: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % dim;
}
