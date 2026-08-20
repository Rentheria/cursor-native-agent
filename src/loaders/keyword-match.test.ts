import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractKeywords,
  findMatchingKeywords,
  promptMatchesKeywords,
} from './keyword-match.js';

describe('keyword matching', () => {
  it('debería_usar_triggers_explícitos_cuando_existen', () => {
    const keywords = extractKeywords('ignored text', ['commit', 'git commit']);
    assert.deepEqual(keywords, ['commit', 'git commit']);
  });

  it('debería_hacer_match_cuando_el_prompt_contiene_un_trigger', () => {
    assert.equal(promptMatchesKeywords('please draft a git commit', ['commit']), true);
    assert.equal(promptMatchesKeywords('hello world', ['commit']), false);
  });

  it('debería_usar_palabras_completas_no_subcadenas', () => {
    assert.equal(promptMatchesKeywords('fix my commitment issues', ['commit']), false);
    assert.equal(promptMatchesKeywords('please commit this', ['commit']), true);
    assert.equal(promptMatchesKeywords('hola, ¿cómo estás?', ['commit', 'error']), false);
  });

  it('debería_matchear_frases_multi_palabra_completas', () => {
    assert.equal(
      promptMatchesKeywords('help me draft a git commit message', ['git commit']),
      true,
    );
    assert.equal(
      promptMatchesKeywords('I use git daily and also commit often', ['git commit']),
      false,
    );
  });

  it('debería_devolver_los_triggers_que_matchearon', () => {
    const matched = findMatchingKeywords('please draft a conventional commit', [
      'commit',
      'error',
      'conventional commit',
    ]);
    assert.deepEqual(matched, ['commit', 'conventional commit']);
  });
});
