import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCursorAgentArgs } from './cursor-agent.js';

describe('buildCursorAgentArgs', () => {
  it('debería_incluir_force_trust_y_mode_cuando_se_piden', () => {
    assert.deepEqual(
      buildCursorAgentArgs(
        {
          prompt: 'hello',
          force: true,
          trust: true,
          mode: 'ask',
        },
        {},
      ),
      ['-p', '--force', '--trust', '--mode', 'ask', 'hello'],
    );
  });

  it('debería_agregar_stream_json_solo_cuando_se_pide', () => {
    assert.deepEqual(
      buildCursorAgentArgs(
        {
          prompt: 'hello',
          force: true,
          trust: true,
          streamJson: true,
        },
        {},
      ),
      [
        '-p',
        '--force',
        '--trust',
        '--output-format',
        'stream-json',
        '--stream-partial-output',
        'hello',
      ],
    );
    assert.deepEqual(buildCursorAgentArgs({ prompt: 'hello' }, {}), [
      '-p',
      'hello',
    ]);
  });

  it('debería_agregar_model_cuando_CURSOR_AGENT_MODEL_está_seteado', () => {
    assert.deepEqual(
      buildCursorAgentArgs(
        { prompt: 'hello' },
        { CURSOR_AGENT_MODEL: 'composer-2.5-fast' },
      ),
      ['-p', '--model', 'composer-2.5-fast', 'hello'],
    );
  });

  it('debería_omitir_model_cuando_CURSOR_AGENT_MODEL_es_auto', () => {
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'auto' }),
      ['-p', 'hello'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'Auto' }),
      ['-p', 'hello'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'AUTO' }),
      ['-p', 'hello'],
    );
  });

  it('debería_omitir_model_cuando_CURSOR_AGENT_MODEL_está_vacío_o_ausente', () => {
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: '' }),
      ['-p', 'hello'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: '  ' }),
      ['-p', 'hello'],
    );
    assert.deepEqual(buildCursorAgentArgs({ prompt: 'hello' }, {}), [
      '-p',
      'hello',
    ]);
  });

  it('debería_combinar_model_con_otras_flags', () => {
    assert.deepEqual(
      buildCursorAgentArgs(
        {
          prompt: 'hello',
          force: true,
          trust: true,
          mode: 'ask',
        },
        { CURSOR_AGENT_MODEL: 'composer-2.5-fast' },
      ),
      [
        '-p',
        '--force',
        '--trust',
        '--mode',
        'ask',
        '--model',
        'composer-2.5-fast',
        'hello',
      ],
    );
  });
});
