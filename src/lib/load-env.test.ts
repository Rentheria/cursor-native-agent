import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyParsedEnv, parseDotEnv } from './load-env.js';

describe('parseDotEnv', () => {
  it('debería_ignorar_comentarios_y_líneas_vacías', () => {
    const parsed = parseDotEnv(`
# comment
PORT=4090

CURSOR_NATIVE_AGENT_DEBUG=1
`);
    assert.deepEqual(parsed, {
      PORT: '4090',
      CURSOR_NATIVE_AGENT_DEBUG: '1',
    });
  });

  it('debería_quitar_comillas_simples_y_dobles', () => {
    const parsed = parseDotEnv(`A="hello world"\nB='x'`);
    assert.equal(parsed['A'], 'hello world');
    assert.equal(parsed['B'], 'x');
  });
});

describe('applyParsedEnv', () => {
  it('debería_no_pisar_variables_ya_seteadas', () => {
    const env: NodeJS.ProcessEnv = { PORT: '1111' };
    applyParsedEnv({ PORT: '4090', CURSOR_NATIVE_AGENT_DEBUG: '1' }, env);
    assert.equal(env['PORT'], '1111');
    assert.equal(env['CURSOR_NATIVE_AGENT_DEBUG'], '1');
  });

  it('debería_aplicar_ejemplo_luego_env_como_capas', () => {
    const env: NodeJS.ProcessEnv = {};
    // Simulate layering: .env.example then .env override
    const example = { PORT: '3847', CURSOR_NATIVE_AGENT_DASHBOARD_CHAT: '1', EXTRA: 'from-example' };
    const override = { PORT: '4090', NEW_KEY: 'from-env' };
    const merged = { ...example, ...override };

    applyParsedEnv(merged, env);
    assert.equal(env['PORT'], '4090'); // .env wins
    assert.equal(env['CURSOR_NATIVE_AGENT_DASHBOARD_CHAT'], '1'); // from .env.example
    assert.equal(env['EXTRA'], 'from-example'); // from .env.example
    assert.equal(env['NEW_KEY'], 'from-env'); // from .env
  });

  it('shell_export_gana_sobre_ejemplo_y_env', () => {
    const env: NodeJS.ProcessEnv = { PORT: '9999' };
    applyParsedEnv({ PORT: '3847' }, env);
    applyParsedEnv({ PORT: '4090' }, env);
    assert.equal(env['PORT'], '9999');
  });
});
