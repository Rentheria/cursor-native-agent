import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCannedPitch, isSpanishPrompt } from './canned-pitch.js';

describe('isSpanishPrompt', () => {
  it('detecta_prompts_en_español', () => {
    assert.equal(isSpanishPrompt('qué hace este repo'), true);
    assert.equal(isSpanishPrompt('Qué es este proyecto'), true);
    assert.equal(isSpanishPrompt('explica este repo'), true);
    assert.equal(isSpanishPrompt('resumen del proyecto'), true);
  });

  it('detecta_prompts_en_inglés', () => {
    assert.equal(isSpanishPrompt('what does this repo do'), false);
    assert.equal(isSpanishPrompt('pitch this'), false);
    assert.equal(isSpanishPrompt('elevator pitch'), false);
    assert.equal(isSpanishPrompt('what is this project'), false);
  });
});

describe('getCannedPitch', () => {
  it('devuelve_pitch_en_español_para_prompts_españoles', () => {
    const pitch = getCannedPitch('qué hace este repo');
    assert.match(pitch, /Agente autónomo construido/);
    assert.match(pitch, /\*\*Hook:\*\*/);
    assert.match(pitch, /\*\*Proof/);
    assert.match(pitch, /\*\*Close:\*\*/);
    assert.match(pitch, /Repo público/);
  });

  it('devuelve_pitch_en_inglés_para_prompts_ingleses', () => {
    const pitch = getCannedPitch('what does this repo do');
    assert.match(pitch, /Autonomous agent built/);
    assert.match(pitch, /\*\*Hook:\*\*/);
    assert.match(pitch, /\*\*Proof/);
    assert.match(pitch, /\*\*Close:\*\*/);
    assert.match(pitch, /Public repo/);
  });

  it('pitch_español_tiene_3_beats_y_no_más_de_12_líneas', () => {
    const pitch = getCannedPitch('qué hace este repo');
    const lines = pitch.split('\n').filter((line) => line.trim() !== '');
    assert.ok(lines.length <= 12, `Expected ≤12 non-empty lines, got ${lines.length}`);
    const hookCount = (pitch.match(/\*\*Hook:\*\*/g) ?? []).length;
    const proofCount = (pitch.match(/\*\*Proof/g) ?? []).length;
    const closeCount = (pitch.match(/\*\*Close:\*\*/g) ?? []).length;
    assert.equal(hookCount, 1, 'Should have exactly one Hook');
    assert.equal(proofCount, 1, 'Should have exactly one Proof');
    assert.equal(closeCount, 1, 'Should have exactly one Close');
  });

  it('pitch_inglés_tiene_3_beats_y_no_más_de_12_líneas', () => {
    const pitch = getCannedPitch('what does this repo do');
    const lines = pitch.split('\n').filter((line) => line.trim() !== '');
    assert.ok(lines.length <= 12, `Expected ≤12 non-empty lines, got ${lines.length}`);
    const hookCount = (pitch.match(/\*\*Hook:\*\*/g) ?? []).length;
    const proofCount = (pitch.match(/\*\*Proof/g) ?? []).length;
    const closeCount = (pitch.match(/\*\*Close:\*\*/g) ?? []).length;
    assert.equal(hookCount, 1, 'Should have exactly one Hook');
    assert.equal(proofCount, 1, 'Should have exactly one Proof');
    assert.equal(closeCount, 1, 'Should have exactly one Close');
  });

  it('no_inventa_features_ni_usa_nombres_personales', () => {
    const pitchEs = getCannedPitch('qué hace este repo');
    const pitchEn = getCannedPitch('what does this repo do');
    
    // No personal names or absolute paths
    assert.doesNotMatch(pitchEs, /\/home\//);
    assert.doesNotMatch(pitchEs, /\/Users\//);
    assert.doesNotMatch(pitchEn, /\/home\//);
    assert.doesNotMatch(pitchEn, /\/Users\//);
  });
});
