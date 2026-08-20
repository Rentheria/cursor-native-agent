import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStreamJsonLine } from './stream-json.js';

describe('parseStreamJsonLine', () => {
  it('debería_extraer_delta_de_assistant_con_timestamp', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp_ms: 1,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'ho' }],
      },
    });
    const parsed = parseStreamJsonLine(line);
    assert.equal(parsed.assistantDelta, 'ho');
    assert.equal(parsed.resultText, undefined);
  });

  it('debería_ignorar_assistant_final_sin_timestamp', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hola' }],
      },
    });
    const parsed = parseStreamJsonLine(line);
    assert.equal(parsed.assistantDelta, undefined);
  });

  it('debería_extraer_result_exitoso', () => {
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'hola',
    });
    const parsed = parseStreamJsonLine(line);
    assert.equal(parsed.resultText, 'hola');
  });

  it('debería_tolerar_líneas_malformadas', () => {
    assert.deepEqual(parseStreamJsonLine('not-json'), {
      assistantDelta: undefined,
      resultText: undefined,
    });
  });
});
