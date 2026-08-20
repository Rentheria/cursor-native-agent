import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractDelegationSubtask,
  hasDelegationIntent,
} from './delegation.js';

describe('delegation detection', () => {
  it('debería_disparar_solo_con_frases_canónicas', () => {
    assert.equal(
      hasDelegationIntent(
        'pídele a otro agente que resume MEMORY.md en una frase',
      ),
      true,
    );
    assert.equal(
      hasDelegationIntent('delega esto a un sub-agente: resume MEMORY.md'),
      true,
    );
    // Old loose keywords must no longer fire by themselves.
    assert.equal(
      hasDelegationIntent('delega resume MEMORY.md a un sub-agente y repórtame'),
      false,
    );
    assert.equal(
      hasDelegationIntent('delegate summarize package.json to a worker'),
      false,
    );
    assert.equal(hasDelegationIntent('explica este error de TypeScript'), false);
  });

  it('debería_extraer_la_subtarea_de_las_frases_canónicas', () => {
    assert.equal(
      extractDelegationSubtask(
        'pídele a otro agente que resume MEMORY.md en una frase',
      ),
      'resume MEMORY.md en una frase',
    );
    assert.equal(
      extractDelegationSubtask(
        'delega esto a un sub-agente: resume MEMORY.md',
      ),
      'resume MEMORY.md',
    );
  });

  it('debería_aceptar_guion_ascii_como_separador', () => {
    // Reproducción del fallo en vivo: la intención disparaba pero la subtarea
    // salía vacía, así que el turno moría con "subtask is empty".
    assert.equal(
      extractDelegationSubtask(
        'delega esto a un sub-agente - lista los nombres bajo skills/',
      ),
      'lista los nombres bajo skills/',
    );
    assert.equal(
      extractDelegationSubtask('delega esto a un worker - resume MEMORY.md'),
      'resume MEMORY.md',
    );
  });

  it('debería_aceptar_los_guiones_tipográficos_pegados_o_con_espacios', () => {
    assert.equal(
      extractDelegationSubtask('delega esto a un sub-agente—resume MEMORY.md'),
      'resume MEMORY.md',
    );
    assert.equal(
      extractDelegationSubtask('delega esto a un sub-agente – resume MEMORY.md'),
      'resume MEMORY.md',
    );
  });

  it('no_debería_partir_en_el_guion_interno_de_sub_agente', () => {
    // Sin separador real no hay subtarea: "agente" no es la tarea delegada.
    assert.equal(extractDelegationSubtask('delega esto a un sub-agente'), '');
  });
});
