import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import type { ChildProcess } from 'node:child_process';

import {
  buildCursorAgentArgs,
  runCursorAgent,
  writePromptToStdin,
} from './cursor-agent.js';

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
      ['-p', '--force', '--trust', '--mode', 'ask'],
    );
  });

  it('NO_debería_poner_el_prompt_en_argv', () => {
    const huge = 'x'.repeat(40_000);
    const args = buildCursorAgentArgs({ prompt: huge, force: true }, {});
    assert.ok(!args.includes(huge));
    assert.ok(args.every((arg) => arg.length < 1000));
    assert.deepEqual(args, ['-p', '--force']);
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
      ],
    );
    assert.deepEqual(buildCursorAgentArgs({ prompt: 'hello' }, {}), ['-p']);
  });

  it('debería_agregar_model_cuando_CURSOR_AGENT_MODEL_está_seteado', () => {
    assert.deepEqual(
      buildCursorAgentArgs(
        { prompt: 'hello' },
        { CURSOR_AGENT_MODEL: 'composer-2.5-fast' },
      ),
      ['-p', '--model', 'composer-2.5-fast'],
    );
  });

  it('debería_omitir_model_cuando_CURSOR_AGENT_MODEL_es_auto', () => {
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'auto' }),
      ['-p'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'Auto' }),
      ['-p'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: 'AUTO' }),
      ['-p'],
    );
  });

  it('debería_omitir_model_cuando_CURSOR_AGENT_MODEL_está_vacío_o_ausente', () => {
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: '' }),
      ['-p'],
    );
    assert.deepEqual(
      buildCursorAgentArgs({ prompt: 'hello' }, { CURSOR_AGENT_MODEL: '  ' }),
      ['-p'],
    );
    assert.deepEqual(buildCursorAgentArgs({ prompt: 'hello' }, {}), ['-p']);
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
      ],
    );
  });
});

describe('writePromptToStdin', () => {
  it('debería_escribir_prompts_de_cualquier_tamaño_en_stdin', () => {
    const chunks: string[] = [];
    const stdin = new PassThrough();
    stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString('utf8'));
    });
    const huge = 'memoria + skills + history\n'.repeat(2000);
    writePromptToStdin({ stdin } as unknown as ChildProcess, huge);
    const written = chunks.join('');
    assert.equal(written, huge);
    assert.ok(written.length > 32_000);
  });
});

function fakeChild(): ChildProcess & {
  readonly stdinChunks: string[];
} {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as ChildProcess;
  const stdinChunks: string[] = [];
  stdin.on('data', (chunk: Buffer) => {
    stdinChunks.push(chunk.toString('utf8'));
  });
  Object.assign(child, {
    stdin,
    stdout,
    stderr,
    pid: 1234,
    stdinChunks,
  });
  return child as ChildProcess & { readonly stdinChunks: string[] };
}

describe('runCursorAgent stdin', () => {
  it('debería_pasar_el_prompt_por_stdin_y_no_por_argv', async () => {
    const child = fakeChild();
    let spawnArgs: string[] = [];
    const resultPromise = runCursorAgent({
      prompt: 'a'.repeat(40_000),
      spawnImpl: (_command, args) => {
        spawnArgs = [...args];
        queueMicrotask(() => {
          (child.stdout as PassThrough).write('ok');
          child.emit('close', 0);
        });
        return child;
      },
    });
    const result = await resultPromise;
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'ok');
    assert.ok(!spawnArgs.some((arg) => arg.length > 1000));
    assert.ok(!spawnArgs.includes('a'.repeat(40_000)));
    assert.equal(child.stdinChunks.join('').length, 40_000);
  });

  it('NO_debería_matar_el_árbol_cuando_el_proceso_termina_normal', async () => {
    const child = fakeChild();
    let killed = false;
    const resultPromise = runCursorAgent({
      prompt: 'hi',
      spawnImpl: () => {
        queueMicrotask(() => {
          (child.stdout as PassThrough).write('done');
          child.emit('close', 0);
        });
        return child;
      },
      killImpl: () => {
        killed = true;
      },
    });
    await resultPromise;
    assert.equal(killed, false);
  });
});
