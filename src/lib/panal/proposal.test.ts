import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatLaunchProposal,
  parsePanalProposalBlock,
  proposeLaunch,
} from './proposal.js';

describe('proposeLaunch', () => {
  it('debería_usar_defaults_read-only_auto_15min', () => {
    const proposal = proposeLaunch({
      prompt: '/task fix the off-by-one in the pager',
      dir: 'D:\\repos\\app',
    });
    assert.equal(proposal.agent, 'auto');
    assert.equal(proposal.mode, 'read-only');
    assert.equal(proposal.timeoutMin, 15);
    assert.equal(proposal.dir, 'D:\\repos\\app');
    assert.match(proposal.task, /off-by-one/);
  });

  it('debería_detectar_cursor_model_write_y_timeout', () => {
    const proposal = proposeLaunch({
      prompt: 'use cursor:grok-4.7-high, write, 30 min: add tests',
      dir: '/tmp/app',
    });
    assert.equal(proposal.agent, 'cursor');
    assert.equal(proposal.model, 'grok-4.7-high');
    assert.equal(proposal.mode, 'write');
    assert.equal(proposal.timeoutMin, 30);
    assert.match(proposal.task, /add tests/);
  });

  it('debería_parsear_bloque_PANAL_PROPOSAL', () => {
    const proposal = parsePanalProposalBlock(`
<<<PANAL_PROPOSAL
agent: claude
mode: read-only
timeout: 20
dir: /work/app
task: review src/pager.ts
PANAL_PROPOSAL>>>
`);
    assert.ok(proposal !== undefined);
    assert.equal(proposal.agent, 'claude');
    assert.equal(proposal.timeoutMin, 20);
    assert.equal(proposal.task, 'review src/pager.ts');
  });
});

describe('formatLaunchProposal', () => {
  it('debería_pedir_confirmación_explícita', () => {
    const text = formatLaunchProposal({
      agent: 'agy',
      mode: 'read-only',
      timeoutMin: 15,
      dir: '/tmp/app',
      task: 'list bugs',
    });
    assert.match(text, /Nothing runs until you confirm/);
    assert.match(text, /\/ok/);
    assert.match(text, /agy/);
  });
});
