import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createStdoutLiveReply } from './stdout-live-reply.js';

describe('createStdoutLiveReply', () => {
  it('debería_imprimir_cada_delta_conforme_llega', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.pushDelta('Hola ');
    liveReply.pushDelta('mundo');

    assert.deepEqual(written, ['Hola ', 'mundo']);
  });

  it('debería_imprimir_la_respuesta_completa_cuando_no_hubo_deltas', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.finish('respuesta bufereada');

    assert.equal(written.join(''), 'respuesta bufereada\n');
  });

  it('debería_cerrar_con_salto_de_línea_sin_repetir_lo_ya_impreso', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.pushDelta('Hola mundo');
    liveReply.finish('Hola mundo');

    assert.equal(written.join(''), 'Hola mundo\n');
  });

  it('debería_ocultar_el_bloque_MEMORY_WRITE_y_cerrar_con_la_respuesta_limpia', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.pushDelta('Listo. ');
    liveReply.pushDelta('<<<MEMORY_WRITE\nname: x\nMEMORY_WRITE>>>');
    liveReply.pushDelta(' Guardado.');
    liveReply.finish('Listo.  Guardado.');

    assert.equal(written.join(''), 'Listo.  Guardado.\n');
  });

  it('debería_ocultar_el_marcador_aunque_llegue_partido_en_dos_deltas', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.pushDelta('Hola <<<MEM');
    liveReply.pushDelta('ORY_WRITE\nname: x\nMEMORY_WRITE>>>');
    liveReply.finish('Hola ');

    assert.equal(written.join(''), 'Hola \n');
  });

  it('debería_imprimir_la_respuesta_canónica_cuando_diverge_de_lo_streameado', () => {
    const written: string[] = [];
    const liveReply = createStdoutLiveReply((text) => written.push(text));

    liveReply.pushDelta('parcial');
    liveReply.finish('respuesta distinta');

    assert.equal(written.join(''), 'parcial\nrespuesta distinta\n');
  });
});
