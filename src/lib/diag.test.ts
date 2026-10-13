import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { isVerbose, diag } from './diag.js';

describe('diag', () => {
  test('isVerbose returns false when env is empty', () => {
    assert.equal(isVerbose({}), false);
  });

  test('isVerbose returns true when CURSOR_NATIVE_AGENT_VERBOSE is set', () => {
    assert.equal(isVerbose({ CURSOR_NATIVE_AGENT_VERBOSE: '1' }), true);
  });

  test('isVerbose returns true when CURSOR_NATIVE_AGENT_DEBUG is set', () => {
    assert.equal(isVerbose({ CURSOR_NATIVE_AGENT_DEBUG: 'debug' }), true);
  });

  test('isVerbose returns false when value is "0"', () => {
    assert.equal(isVerbose({ CURSOR_NATIVE_AGENT_VERBOSE: '0' }), false);
    assert.equal(isVerbose({ CURSOR_NATIVE_AGENT_DEBUG: '0' }), false);
  });

  test('isVerbose returns false when value is empty string', () => {
    assert.equal(isVerbose({ CURSOR_NATIVE_AGENT_VERBOSE: '' }), false);
  });

  test('diag does not throw', () => {
    assert.doesNotThrow(() => diag('test message'));
  });
});
