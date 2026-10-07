import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import type { ChildProcess } from 'node:child_process';

import {
  buildPanalDashboardArgs,
  buildPanalListArgs,
  formatPanalStatus,
  listPanalRuns,
} from './status.js';

describe('panal list/dashboard args', () => {
  it('debería_usar_-history_y_-once', () => {
    assert.deepEqual(buildPanalListArgs(), ['-history']);
    assert.deepEqual(buildPanalDashboardArgs(), ['-once']);
  });
});

describe('listPanalRuns', () => {
  it('debería_llamar_panal_-history', async () => {
    const seen: string[][] = [];
    const result = await listPanalRuns((command, args) => {
      seen.push([command, ...args]);
      const child = new EventEmitter() as ChildProcess;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      Object.assign(child, { stdout, stderr, pid: 1 });
      queueMicrotask(() => {
        stdout.write('1 done cursor pager');
        child.emit('close', 0);
      });
      return child;
    });
    assert.equal(result.ok, true);
    assert.equal(seen[0]?.[1], '-history');
    assert.match(formatPanalStatus(result), /pager/);
  });
});
