import { MIN_KEYWORD_LENGTH, STOP_WORDS } from '../lib/constants.js';

/**
 * Tokenizes text into lowercase keywords for simple trigger matching.
 * Explicit triggers (comma-separated frontmatter) take priority when provided.
 */
export function extractKeywords(
  text: string,
  explicitTriggers: readonly string[] = [],
): readonly string[] {
  if (explicitTriggers.length > 0) {
    return explicitTriggers
      .map((trigger) => trigger.trim().toLowerCase())
      .filter((trigger) => trigger.length > 0);
  }

  const tokens = tokenize(text).filter(
    (token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token),
  );

  return [...new Set(tokens)];
}

/** Returns true when the prompt contains any candidate as a whole word/phrase. */
export function promptMatchesKeywords(
  prompt: string,
  keywords: readonly string[],
): boolean {
  return findMatchingKeywords(prompt, keywords).length > 0;
}

/**
 * Returns which keywords matched the prompt as whole words/phrases.
 * Avoids substring false positives (e.g. "commit" inside "commitment").
 */
export function findMatchingKeywords(
  prompt: string,
  keywords: readonly string[],
): readonly string[] {
  const promptTokens = tokenize(prompt);
  const matched: string[] = [];

  for (const keyword of keywords) {
    const keyTokens = tokenize(keyword);
    if (keyTokens.length === 0) {
      continue;
    }
    if (containsPhrase(promptTokens, keyTokens)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/** Splits text into lowercase alphanumeric tokens (Unicode letters/digits). */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function containsPhrase(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 1) {
    const only = needle[0];
    return only !== undefined && haystack.includes(only);
  }

  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
}
