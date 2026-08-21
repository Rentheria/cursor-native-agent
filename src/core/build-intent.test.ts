import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isBuildIntent } from './build-intent.js';

describe('isBuildIntent', () => {
  it('debería_detectar_haz_un_una_con_artefacto', () => {
    assert.equal(isBuildIntent('haz un splitter de gastos'), true);
    assert.equal(isBuildIntent('haz una calculadora'), true);
    assert.equal(isBuildIntent('haz una app de tareas'), true);
    assert.equal(isBuildIntent('construye un programa'), true);
    assert.equal(isBuildIntent('crea una página web'), true);
  });
  
  it('debería_detectar_make_build_create_con_artefacto', () => {
    assert.equal(isBuildIntent('make a todo app'), true);
    assert.equal(isBuildIntent('build a calculator'), true);
    assert.equal(isBuildIntent('create an api'), true);
    assert.equal(isBuildIntent('make a dashboard'), true);
  });
  
  it('debería_detectar_artefactos_sin_verbo_explícito', () => {
    assert.equal(isBuildIntent('splitter de gastos en HTML vanilla'), true);
    assert.equal(isBuildIntent('calculadora CLI en Python'), true);
    assert.equal(isBuildIntent('proyecto de juego en JS'), true);
    assert.equal(isBuildIntent('web tracker with localStorage'), true);
  });
  
  it('NO_debería_detectar_haz_un_commit', () => {
    assert.equal(isBuildIntent('haz un commit'), false);
    assert.equal(isBuildIntent('haz un commit con lo que hay'), false);
    assert.equal(isBuildIntent('make a commit'), false);
  });
  
  it('NO_debería_detectar_summarize_resume', () => {
    assert.equal(isBuildIntent('summarize file MEMORY.md'), false);
    assert.equal(isBuildIntent('resume este archivo'), false);
    assert.equal(isBuildIntent('make a summary'), false);
  });
  
  it('NO_debería_detectar_pitch_explica_qué_hace', () => {
    assert.equal(isBuildIntent('qué hace este repo'), false);
    assert.equal(isBuildIntent('what does this repo do'), false);
    assert.equal(isBuildIntent('explica el pitch'), false);
    assert.equal(isBuildIntent('haz un pitch'), false);
  });
  
  it('NO_debería_detectar_preguntas_describe_explain', () => {
    assert.equal(isBuildIntent('describe el clima de Guadalajara'), false);
    assert.equal(isBuildIntent('explain this error'), false);
    assert.equal(isBuildIntent('how does the memory work'), false);
  });
  
  it('debería_detectar_construye_una_app_aunque_tenga_otros_verbos', () => {
    assert.equal(isBuildIntent('construye una aplicación de notas'), true);
  });
});
