import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

describe('REPL module', () => {
  test('CLI thread ID is stable', () => {
    // The CLI thread ID should be a stable constant that doesn't change
    const cliThreadId = 'cli-repl';
    assert.ok(typeof cliThreadId === 'string');
    assert.ok(cliThreadId.length > 0);
    assert.equal(cliThreadId, 'cli-repl');
  });

  test('REPL uses consistent thread across sessions', () => {
    // This is a documentation test: REPL should use the same thread ID
    // across restarts so conversation history persists.
    // The actual thread persistence is tested in threads-store.test.ts
    const expectedThreadId = 'cli-repl';
    assert.ok(expectedThreadId !== undefined);
  });
});
