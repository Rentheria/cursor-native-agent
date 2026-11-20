import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cancelPendingDashboardLaunch,
  consumePendingDashboardLaunch,
  hasPendingDashboardLaunch,
  setPendingDashboardLaunch,
  setPendingReplLaunch,
  consumePendingReplLaunch,
  hasPendingReplLaunch,
} from './pending-launch.js';
import type { LaunchProposal } from './proposal.js';

const proposal: LaunchProposal = {
  agent: 'auto',
  mode: 'read-only',
  timeoutMin: 15,
  dir: '/tmp/app',
  task: 'review',
};

describe('pending-launch', () => {
  it('dashboard: set consume cancel', () => {
    setPendingDashboardLaunch(proposal, 'thread-1');
    assert.equal(hasPendingDashboardLaunch(), true);
    const entry = consumePendingDashboardLaunch();
    assert.equal(entry?.proposal.task, 'review');
    assert.equal(entry?.threadId, 'thread-1');
    assert.equal(hasPendingDashboardLaunch(), false);
    setPendingDashboardLaunch(proposal);
    cancelPendingDashboardLaunch();
    assert.equal(hasPendingDashboardLaunch(), false);
  });

  it('repl: por clave de sesión', () => {
    setPendingReplLaunch('cli-repl', proposal);
    assert.equal(hasPendingReplLaunch('cli-repl'), true);
    assert.equal(hasPendingReplLaunch('other'), false);
    assert.equal(consumePendingReplLaunch('cli-repl')?.proposal.agent, 'auto');
  });

  it('expira', async () => {
    setPendingDashboardLaunch(proposal, undefined, 5);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(hasPendingDashboardLaunch(), false);
  });
});
