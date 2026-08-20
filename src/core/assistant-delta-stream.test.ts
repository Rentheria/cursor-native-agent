import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withoutSegmentRecaps } from './assistant-delta-stream.js';

describe('withoutSegmentRecaps', () => {
  it('debería_dejar_pasar_los_parciales_incrementales_de_un_segmento', () => {
    const received: string[] = [];
    const onDelta = withoutSegmentRecaps((text) => received.push(text));

    onDelta('Hora actual: **3');
    onDelta(':56:59 PM CST**.');

    assert.deepEqual(received, ['Hora actual: **3', ':56:59 PM CST**.']);
  });

  it('debería_descartar_el_recap_que_repite_el_segmento_completo', () => {
    const received: string[] = [];
    const onDelta = withoutSegmentRecaps((text) => received.push(text));

    onDelta('Voy a revisar ');
    onDelta('el sistema.');
    onDelta('Voy a revisar el sistema.');

    assert.deepEqual(received, ['Voy a revisar ', 'el sistema.']);
  });

  it('debería_reconstruir_la_respuesta_final_en_un_turno_de_dos_segmentos', () => {
    const received: string[] = [];
    const onDelta = withoutSegmentRecaps((text) => received.push(text));

    onDelta('Voy a revisar el sistema.');
    onDelta('Voy a revisar el sistema.');
    onDelta('Hora actual: **3');
    onDelta(':56:59 PM CST**.');

    assert.equal(
      received.join(''),
      'Voy a revisar el sistema.Hora actual: **3:56:59 PM CST**.',
    );
  });

  it('debería_conservar_un_texto_repetido_que_pertenece_a_otro_segmento', () => {
    const received: string[] = [];
    const onDelta = withoutSegmentRecaps((text) => received.push(text));

    onDelta('Listo.');
    onDelta('Listo.');
    onDelta('Listo.');

    assert.deepEqual(received, ['Listo.', 'Listo.']);
  });
});
