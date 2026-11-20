import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { startSpinner } from './spinner.js';

describe('spinner', () => {
  test('startSpinner returns a handle with stop', () => {
    const handle = startSpinner('test');
    assert.ok(typeof handle.stop === 'function');
    handle.stop();
  });

  test('stop is idempotent', () => {
    const handle = startSpinner('test');
    handle.stop();
    assert.doesNotThrow(() => handle.stop());
  });

  test('startSpinner does not throw when stderr is not TTY', () => {
    assert.doesNotThrow(() => {
      const handle = startSpinner('test');
      handle.stop();
    });
  });
});
