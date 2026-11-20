import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isCancelCommand,
  isConfirmCommand,
  isPanalLaunchIntent,
  isPanalStatusIntent,
  stripTaskCommand,
} from './intent.js';

describe('isPanalLaunchIntent', () => {
  it('debería_detectar_comandos_y_frases_de_lanzamiento', () => {
    assert.equal(isPanalLaunchIntent('/task fix the pager'), true);
    assert.equal(isPanalLaunchIntent('/panal use cursor'), true);
    assert.equal(isPanalLaunchIntent('panal delegate -d ./app fix it'), true);
    assert.equal(isPanalLaunchIntent('lanza un agente para revisar el repo'), true);
    assert.equal(isPanalLaunchIntent('launch a coding agent to add tests'), true);
    assert.equal(isPanalLaunchIntent('delega esto a cursor: arregla el bug'), true);
    assert.equal(isPanalLaunchIntent('delega esto a un sub-agente: resume MEMORY.md'), false);
    assert.equal(isPanalLaunchIntent('summarize MEMORY.md'), false);
  });
});

describe('isPanalStatusIntent', () => {
  it('debería_detectar_pedidos_de_estado', () => {
    assert.equal(isPanalStatusIntent('/panal-status'), true);
    assert.equal(isPanalStatusIntent('panal list'), true);
    assert.equal(isPanalStatusIntent('status de las runs de panal'), true);
    assert.equal(isPanalStatusIntent('hola'), false);
  });
});

describe('confirm/cancel', () => {
  it('debería_reconocer_ok_y_no', () => {
    assert.equal(isConfirmCommand('/ok'), true);
    assert.equal(isConfirmCommand('yes'), true);
    assert.equal(isCancelCommand('/no'), true);
    assert.equal(isCancelCommand('cancel'), true);
    assert.equal(isConfirmCommand('maybe'), false);
  });
});

describe('stripTaskCommand', () => {
  it('debería_quitar_/task_y_/panal', () => {
    assert.equal(stripTaskCommand('/task fix the pager'), 'fix the pager');
    assert.equal(stripTaskCommand('/panal use agy'), 'use agy');
  });
});
