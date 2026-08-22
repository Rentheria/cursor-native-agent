import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  runAgentTurn,
  type AgentRunner,
  type WorkerDispatcher,
} from './agent-turn.js';
import type { CursorAgentRunResult } from './cursor-agent.js';

interface RunnerCall {
  readonly prompt: string;
  readonly cwd: string | undefined;
  readonly force: boolean | undefined;
  readonly trust: boolean | undefined;
  readonly streamJson: boolean | undefined;
  readonly onAssistantDelta: ((text: string) => void) | undefined;
}

/** Records what the orchestrator would have sent to the real `cursor-agent`. */
function fakeRunner(
  reply: string | ((call: RunnerCall) => CursorAgentRunResult),
): { readonly runAgent: AgentRunner; readonly calls: RunnerCall[] } {
  const calls: RunnerCall[] = [];
  const runAgent: AgentRunner = async (options) => {
    const call: RunnerCall = {
      prompt: options.prompt,
      cwd: options.cwd,
      force: options.force,
      trust: options.trust,
      streamJson: options.streamJson,
      onAssistantDelta: options.onAssistantDelta,
    };
    calls.push(call);
    return typeof reply === 'string'
      ? { stdout: reply, stderr: '', exitCode: 0 }
      : reply(call);
  };
  return { runAgent, calls };
}

/** Minimal repo the loaders accept: one index entry, one detail, one skill. */
async function makeRepo(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-turn-'));
  await mkdir(path.join(repoRoot, 'memory'), { recursive: true });
  await mkdir(path.join(repoRoot, 'skills'), { recursive: true });
  await mkdir(path.join(repoRoot, '.git'), { recursive: true });

  await writeFile(
    path.join(repoRoot, 'MEMORY.md'),
    [
      '# MEMORY',
      '',
      '- [House git rules](memory/house-git-rules.md) — commit trailer y ramas',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'memory/house-git-rules.md'),
    [
      '---',
      'name: house-git-rules',
      'description: convenciones de commit de la casa',
      'metadata:',
      '  type: convention',
      '---',
      '',
      'Los commits llevan trailer de co-author.',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'skills/git-commit.md'),
    [
      '---',
      'name: git-commit',
      'description: arma un commit siguiendo la convención',
      'triggers: commit',
      '---',
      '',
      'Cuerpo de la skill git-commit.',
      '',
    ].join('\n'),
    'utf8',
  );

  return repoRoot;
}

async function readNdjson(repoRoot: string): Promise<readonly unknown[]> {
  const raw = await readFile(path.join(repoRoot, 'logs/agent.ndjson'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line));
}

describe('runAgentTurn (pipeline directo)', () => {
  it('debería_rechazar_un_prompt_vacío_sin_llamar_al_agente', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('nunca');

    await assert.rejects(
      () => runAgentTurn({ repoRoot, userPrompt: '   ', runAgent }),
      /Empty prompt/,
    );
    assert.equal(calls.length, 0);
  });

  it('debería_armar_el_prompt_con_memoria_skills_y_petición_del_usuario', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('respuesta del agente');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit con lo que hay',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.cwd, repoRoot);
    assert.equal(sent.force, true, 'CLI mode should use force');
    assert.equal(sent.trust, true, 'CLI mode should use trust');
    assert.match(sent.prompt, /## Memory index \(always loaded\)/);
    assert.match(sent.prompt, /House git rules/);
    assert.match(sent.prompt, /### Skill: git-commit/);
    assert.match(sent.prompt, /Cuerpo de la skill git-commit/);
    assert.match(sent.prompt, /## User request\n\nhaz un commit con lo que hay$/);
    assert.match(sent.prompt, /workspace\/.*directory/is);

    assert.deepEqual(result, {
      reply: 'respuesta del agente',
      stderr: '',
      exitCode: 0,
    });
  });

  it('debería_propagar_stderr_y_exit_code_del_agente', async () => {
    const repoRoot = await makeRepo();
    const runAgent: AgentRunner = async () => ({
      stdout: 'salida parcial',
      stderr: 'algo salió mal',
      exitCode: 3,
    });

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'explica este error',
      runAgent,
    });

    assert.equal(result.stderr, 'algo salió mal');
    assert.equal(result.exitCode, 3);
  });

  it('no_debería_inyectar_skills_que_no_matchean', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('ok');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'describe el clima de Guadalajara',
      runAgent,
    });

    assert.match(calls[0]?.prompt ?? '', /_No skills matched this prompt\._/);
  });

  it('debería_aplicar_los_MEMORY_WRITE_y_quitarlos_de_la_respuesta', async () => {
    const repoRoot = await makeRepo();
    const stdout = [
      'Anotado.',
      '',
      '<<<MEMORY_WRITE',
      'slug: front-row',
      'title: Front row',
      'hook: asientos de adelante en meetups',
      'description: prefiere sentarse adelante',
      'type: preference',
      '---',
      'Sentarse adelante para ver los demos.',
      'MEMORY_WRITE>>>',
      '',
    ].join('\n');
    const { runAgent } = fakeRunner(stdout);

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'recuerda que prefiero los asientos de adelante',
      runAgent,
    });

    assert.equal(result.reply, 'Anotado.');
    assert.doesNotMatch(result.reply, /MEMORY_WRITE/);
    assert.match(
      await readFile(path.join(repoRoot, 'memory/front-row.md'), 'utf8'),
      /Sentarse adelante para ver los demos\./,
    );
    assert.match(
      await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8'),
      /- \[Front row\]\(memory\/front-row\.md\)/,
    );
  });

  it('debería_pasar_las_banderas_de_streaming_solo_cuando_se_piden', async () => {
    const repoRoot = await makeRepo();
    const deltas: string[] = [];
    const streaming = fakeRunner((call) => {
      call.onAssistantDelta?.('parcial');
      return { stdout: 'final', stderr: '', exitCode: 0 };
    });

    await runAgentTurn({
      repoRoot,
      userPrompt: 'hola',
      runAgent: streaming.runAgent,
      stream: true,
      onAssistantDelta: (text) => {
        deltas.push(text);
      },
    });

    assert.equal(streaming.calls[0]?.streamJson, true);
    assert.deepEqual(deltas, ['parcial']);

    const plain = fakeRunner('final');
    await runAgentTurn({ repoRoot, userPrompt: 'hola', runAgent: plain.runAgent });
    assert.equal(plain.calls[0]?.streamJson, undefined);
    assert.equal(plain.calls[0]?.onAssistantDelta, undefined);
  });

  it('debería_registrar_el_turno_en_logs_agent_ndjson_con_latencias', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('ok');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit con lo que hay',
      runAgent,
    });

    const entries = await readNdjson(repoRoot);
    assert.equal(entries.length, 1);
    const entry = entries[0] as Record<string, unknown>;
    assert.equal(entry['prompt'], 'haz un commit con lo que hay');
    assert.deepEqual(entry['skillsMatched'], ['git-commit']);
    assert.deepEqual((entry['memory'] as Record<string, unknown>)['indexEntries'], 1);
    assert.equal(typeof entry['cursorAgentMs'], 'number');
    assert.equal(typeof entry['totalMs'], 'number');
    assert.equal(entry['reply'], 'ok');
    assert.equal(entry['exitCode'], 0);
  });

  it('debería_registrar_la_respuesta_y_exitCode_en_ndjson', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('respuesta del agente');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'test prompt',
      runAgent,
    });

    const entries = await readNdjson(repoRoot);
    assert.equal(entries.length, 1);
    const entry = entries[0] as Record<string, unknown>;
    assert.equal(entry['reply'], 'respuesta del agente');
    assert.equal(entry['exitCode'], 0);
  });

  it('debería_registrar_exitCode_distinto_de_cero', async () => {
    const repoRoot = await makeRepo();
    const runAgent: AgentRunner = async () => ({
      stdout: 'error output',
      stderr: 'error message',
      exitCode: 3,
    });

    await runAgentTurn({
      repoRoot,
      userPrompt: 'test error',
      runAgent,
    });

    const entries = await readNdjson(repoRoot);
    assert.equal(entries.length, 1);
    const entry = entries[0] as Record<string, unknown>;
    assert.equal(entry['reply'], 'error output');
    assert.equal(entry['exitCode'], 3);
  });

  it('debería_usar_repoRoot_con_trust_y_no_force_en_modo_seguro_para_prompts_normales', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('respuesta segura');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'summarize file MEMORY.md',
      runAgent,
      safeMode: true,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.cwd, repoRoot, 'Safe mode with non-build prompt should use repoRoot as cwd');
    assert.equal(sent.force, false, 'Safe mode with non-build prompt should not use force');
    assert.equal(sent.trust, true, 'Safe mode should use trust');
    assert.equal(result.reply, 'respuesta segura');
  });

  it('debería_pedir_confirmación_en_safeMode_cuando_hay_build_intent', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('calculadora creada');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora CLI en Python',
      runAgent,
      safeMode: true,
    });

    assert.equal(calls.length, 0, 'Safe mode with build intent should NOT call agent before confirmation');
    assert.match(result.reply, /esta solicitud va a escribir archivos/i);
    assert.match(result.reply, /\/ok/);
    assert.equal(result.requiresForceConfirmation, true);
  });

  it('debería_usar_workspace_cuando_matchea_skill_clarify_build', async () => {
    const repoRoot = await makeRepo();
    await writeFile(
      path.join(repoRoot, 'skills/clarify-build.md'),
      [
        '---',
        'name: clarify-build',
        'description: ask questions before building',
        'triggers: build, make, create',
        '---',
        '',
        'Ask clarifying questions.',
        '',
      ].join('\n'),
      'utf8',
    );

    const { runAgent, calls } = fakeRunner('¿qué lenguaje prefieres?');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'make a calculator',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/);
  });
  
  it('debería_usar_workspace_para_haz_un_splitter_aunque_no_matchee_skill', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('construyendo splitter...');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un splitter de gastos en HTML vanilla con localStorage',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/, 'Should use workspace for build intent');
  });
  
  it('debería_usar_workspace_para_haz_una_calculadora', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('construyendo calculadora...');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/, 'Should use workspace for build intent');
  });
  
  it('debería_usar_workspace_para_make_a_todo_app', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('building todo app...');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'make a todo app',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/, 'Should use workspace for build intent');
  });
  
  it('NO_debería_usar_workspace_para_haz_un_commit', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('commit hecho');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.cwd, repoRoot, 'Should use repoRoot for non-build commands');
  });
  
  it('NO_debería_usar_workspace_para_summarize_file', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('resumen del archivo');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'summarize file MEMORY.md',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.cwd, repoRoot, 'Should use repoRoot for non-build commands');
  });
  
  it('debería_inyectar_clarify_build_cuando_hay_build_intent_pero_skill_no_matchea', async () => {
    const repoRoot = await makeRepo();
    await writeFile(
      path.join(repoRoot, 'skills/clarify-build.md'),
      [
        '---',
        'name: clarify-build',
        'description: ask questions before building',
        'triggers: build, create',
        '---',
        '',
        'Ask clarifying questions for underspecified builds.',
        'Build directly for well-specified builds.',
        '',
      ].join('\n'),
      'utf8',
    );

    const { runAgent, calls } = fakeRunner('construyendo...');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un splitter de gastos en HTML vanilla',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/, 'Should use workspace for build intent');
    assert.match(sent.prompt, /### Skill: clarify-build/i, 'Should inject clarify-build skill');
    assert.match(sent.prompt, /Ask clarifying questions for underspecified/i, 'Should include skill body');
  });
});

describe('runAgentTurn (stage-pitch determinístico)', () => {
  async function makeRepoWithStagePitch(): Promise<string> {
    const repoRoot = await makeRepo();
    await writeFile(
      path.join(repoRoot, 'skills/stage-pitch.md'),
      [
        '---',
        'name: stage-pitch',
        'description: Deliver a 30-second stage pitch',
        'triggers: pitch, qué hace este repo, what does this repo do',
        '---',
        '',
        'Stage pitch skill body.',
        '',
      ].join('\n'),
      'utf8',
    );
    return repoRoot;
  }

  it('debería_devolver_pitch_español_sin_llamar_al_modelo', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent, calls } = fakeRunner('nunca se llama');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'qué hace este repo',
      runAgent,
    });

    assert.equal(calls.length, 0, 'Should not call cursor-agent when stage-pitch matches');
    assert.match(result.reply, /Agente autónomo construido/);
    assert.match(result.reply, /\*\*Hook:\*\*/);
    assert.match(result.reply, /\*\*Proof/);
    assert.match(result.reply, /\*\*Close:\*\*/);
    assert.equal(result.exitCode, 0);
  });

  it('debería_devolver_pitch_inglés_sin_llamar_al_modelo', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent, calls } = fakeRunner('nunca se llama');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'what does this repo do',
      runAgent,
    });

    assert.equal(calls.length, 0, 'Should not call cursor-agent when stage-pitch matches');
    assert.match(result.reply, /Autonomous agent built/);
    assert.match(result.reply, /\*\*Hook:\*\*/);
    assert.match(result.reply, /\*\*Proof/);
    assert.match(result.reply, /\*\*Close:\*\*/);
    assert.equal(result.exitCode, 0);
  });

  it('debería_devolver_pitch_sin_llamar_al_modelo_incluso_en_safeMode', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent, calls } = fakeRunner('nunca se llama');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'qué hace este repo',
      runAgent,
      safeMode: true,
    });

    assert.equal(calls.length, 0, 'Should not call cursor-agent when stage-pitch matches in safeMode');
    assert.match(result.reply, /Agente autónomo construido/);
    assert.equal(result.exitCode, 0);
  });

  it('debería_tomar_path_de_pitch_incluso_si_otros_skills_matchean', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent, calls } = fakeRunner('nunca se llama');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit con el pitch de este repo',
      runAgent,
    });

    assert.equal(calls.length, 0, 'Should short-circuit even with multiple skill matches');
    assert.match(result.reply, /Agente autónomo construido|Autonomous agent built/);
    assert.equal(result.exitCode, 0);
  });

  it('debería_registrar_el_pitch_en_logs_agent_ndjson', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent } = fakeRunner('nunca se llama');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'qué hace este repo',
      runAgent,
    });

    const entries = await readNdjson(repoRoot);
    assert.equal(entries.length, 1);
    const entry = entries[0] as Record<string, unknown>;
    assert.equal(entry['prompt'], 'qué hace este repo');
    assert.deepEqual(entry['skillsMatched'], ['stage-pitch']);
    assert.equal(entry['cursorAgentMs'], 0, 'Should record 0ms for cursor-agent when canned');
    assert.match(entry['reply'] as string, /Agente autónomo construido/);
    assert.equal(entry['exitCode'], 0);
  });

  it('prompt_sin_stage_pitch_debería_llamar_al_modelo_normalmente', async () => {
    const repoRoot = await makeRepoWithStagePitch();
    const { runAgent, calls } = fakeRunner('respuesta normal del agente');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'resume MEMORY.md',
      runAgent,
    });

    assert.equal(calls.length, 1, 'Should call cursor-agent for non-pitch prompts');
    assert.equal(result.reply, 'respuesta normal del agente');
  });
});

describe('runAgentTurn (delegación)', () => {
  const workerResult = {
    ref: 'worker-1',
    logPath: '/tmp/worker-1.log',
    registryPath: '/tmp/worker-1.env',
    exitCode: 0,
    output: 'MEMORY.md indexa las reglas de git de la casa.',
    startedAt: '2026-08-11T06:00:00.000Z',
    finishedAt: '2026-08-11T06:00:05.000Z',
  };

  it('debería_despachar_un_worker_y_reportar_su_salida', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('informe del padre');
    const dispatched: Array<{ ref: string; prompt: string; repoRoot: string }> = [];
    const runWorker: WorkerDispatcher = async (options) => {
      dispatched.push(options);
      return { ...workerResult, ref: options.ref };
    };

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'delega esto a un sub-agente: resume MEMORY.md',
      runAgent,
      runWorker,
    });

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]?.prompt, 'resume MEMORY.md');
    assert.equal(dispatched[0]?.repoRoot, repoRoot);
    assert.match(dispatched[0]?.ref ?? '', /^worker-\d+$/);

    // El padre corre una sola vez, con la salida del worker como evidencia.
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.prompt ?? '', /# Worker dispatch result/);
    assert.match(calls[0]?.prompt ?? '', /MEMORY\.md indexa las reglas de git/);
    assert.equal(result.reply, 'informe del padre');
  });

  it('debería_delegar_también_con_guion_ascii_como_separador', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('informe del padre');
    let subtask = '';
    const runWorker: WorkerDispatcher = async (options) => {
      subtask = options.prompt;
      return { ...workerResult, ref: options.ref };
    };

    await runAgentTurn({
      repoRoot,
      userPrompt: 'delega esto a un sub-agente - lista los nombres bajo skills/',
      runAgent,
      runWorker,
    });

    assert.equal(subtask, 'lista los nombres bajo skills/');
  });

  it('debería_fallar_claro_si_hay_intención_pero_no_subtarea', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('nunca');
    let dispatchedWorkers = 0;
    const runWorker: WorkerDispatcher = async (options) => {
      dispatchedWorkers += 1;
      return { ...workerResult, ref: options.ref };
    };

    await assert.rejects(
      () =>
        runAgentTurn({
          repoRoot,
          userPrompt: 'delega esto a un sub-agente',
          runAgent,
          runWorker,
        }),
      /subtask is empty/,
    );
    assert.equal(dispatchedWorkers, 0);
    assert.equal(calls.length, 0);
  });

  it('no_debería_delegar_con_frases_parecidas_pero_no_canónicas', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('respuesta directa');
    let dispatchedWorkers = 0;
    const runWorker: WorkerDispatcher = async (options) => {
      dispatchedWorkers += 1;
      return { ...workerResult, ref: options.ref };
    };

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'delegate summarizing MEMORY.md to a worker',
      runAgent,
      runWorker,
    });

    assert.equal(dispatchedWorkers, 0);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0]?.prompt ?? '', /# Worker dispatch result/);
    assert.equal(result.reply, 'respuesta directa');
  });
});

describe('runAgentTurn (git safety guard)', () => {
  async function makeRepoWithoutGit(): Promise<string> {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cna-turn-'));
    await mkdir(path.join(repoRoot, 'memory'), { recursive: true });
    await mkdir(path.join(repoRoot, 'skills'), { recursive: true });

    await writeFile(
      path.join(repoRoot, 'MEMORY.md'),
      [
        '# MEMORY',
        '',
        '- [House git rules](memory/house-git-rules.md) — commit trailer y ramas',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(repoRoot, 'memory/house-git-rules.md'),
      [
        '---',
        'name: house-git-rules',
        'description: convenciones de commit de la casa',
        'metadata:',
        '  type: convention',
        '---',
        '',
        'Los commits llevan trailer de co-author.',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(repoRoot, 'skills/git-commit.md'),
      [
        '---',
        'name: git-commit',
        'description: arma un commit siguiendo la convención',
        'triggers: commit',
        '---',
        '',
        'Cuerpo de la skill git-commit.',
        '',
      ].join('\n'),
      'utf8',
    );

    return repoRoot;
  }

  it('debería_rechazar_git_commit_sin_repo_git', async () => {
    const repoRoot = await makeRepoWithoutGit();
    const { runAgent, calls } = fakeRunner('nunca se llama');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit',
      runAgent,
    });

    assert.equal(calls.length, 0, 'Should not call cursor-agent when git-commit matches but no .git');
    assert.match(result.reply, /No git repository detected/);
    assert.match(result.reply, /git init/);
    assert.equal(result.exitCode, 0);
  });

  it('debería_permitir_git_commit_con_repo_git', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('commit creado');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz un commit',
      runAgent,
    });

    assert.equal(calls.length, 1, 'Should call cursor-agent when git-commit matches and .git exists');
    assert.equal(result.reply, 'commit creado');
  });
});

describe('runAgentTurn (confirmación de --force en safeMode)', () => {
  it('debería_pedir_confirmación_para_un_build_en_safeMode', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('no debería llamarse');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora',
      runAgent,
      safeMode: true,
    });

    assert.equal(calls.length, 0, 'No debería llamar a cursor-agent antes de confirmación');
    assert.match(result.reply, /esta solicitud va a escribir archivos/i);
    assert.match(result.reply, /\/ok/);
    assert.match(result.reply, /\/no/);
    assert.equal(result.requiresForceConfirmation, true);
    assert.equal(result.exitCode, 0);
  });

  it('debería_ejecutar_build_después_de_confirmedForce', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('calculadora creada');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora',
      runAgent,
      safeMode: true,
      confirmedForce: true,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.match(sent.cwd ?? '', /workspace$/);
    assert.equal(sent.force, true, 'Confirmed build should use --force');
    assert.equal(sent.trust, true);
    assert.equal(result.reply, 'calculadora creada');
    assert.equal(result.requiresForceConfirmation, undefined);
  });

  it('CLI_debería_usar_force_sin_confirmación', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('calculadora creada');

    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora',
      runAgent,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.force, true, 'CLI mode should use force without confirmation');
    assert.equal(result.reply, 'calculadora creada');
    assert.equal(result.requiresForceConfirmation, undefined);
  });

  it('debería_usar_workspacePath_personalizado', async () => {
    const repoRoot = await makeRepo();
    const customWorkspace = path.join(repoRoot, 'workspace', 'telegram', '12345');
    const { runAgent, calls } = fakeRunner('app creada');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'crea una app',
      runAgent,
      safeMode: true,
      confirmedForce: true,
      workspacePath: customWorkspace,
    });

    assert.equal(calls.length, 1);
    const sent = calls[0];
    assert.ok(sent !== undefined);
    assert.equal(sent.cwd, customWorkspace, 'Should use custom workspace path as cwd');
    assert.equal(sent.force, true);
    assert.equal(sent.trust, true);
  });

  it('contexto_con_build_previo_NO_debe_re-disparar_build_intent', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('de nada');

    // Simulate reopening a past turn where the original was "haz una calculadora"
    // and the new message is just "gracias" (not a build request)
    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'gracias',
      context: {
        userPrompt: 'haz una calculadora',
        assistantReply: 'Calculadora creada.',
      },
      runAgent,
      safeMode: true,
    });

    // The context contains "haz una calculadora" and "calculadora", which normally
    // would trigger build intent if it was part of userPrompt. But since it's in context,
    // build intent should only check the current message "gracias", which is NOT a build.
    // The agent should be called normally without asking for confirmation.
    assert.equal(calls.length, 1, 'Should call agent without asking for confirmation');
    assert.equal(result.requiresForceConfirmation, undefined);
    assert.equal(result.reply, 'de nada');
  });

  it('nuevo_build_tras_contexto_SÍ_debe_pedir_confirmación', async () => {
    const repoRoot = await makeRepo();
    const { runAgent, calls } = fakeRunner('no debería llamarse');

    // Context from a previous non-build turn, but current message IS a build request
    const result = await runAgentTurn({
      repoRoot,
      userPrompt: 'haz una calculadora',
      context: {
        userPrompt: 'qué hace este repo',
        assistantReply: 'Es un wrapper...',
      },
      runAgent,
      safeMode: true,
    });

    // The current message "haz una calculadora" IS a build request, so it should ask for confirmation
    assert.equal(calls.length, 0, 'Should NOT call agent before confirmation');
    assert.equal(result.requiresForceConfirmation, true);
    assert.match(result.reply, /esta solicitud va a escribir archivos/i);
  });
});

describe('memoria auto-persistida sin MEMORY_WRITE block', () => {
  it('debería_crear_memoria_cuando_prompt_es_recuerda_y_no_hay_MEMORY_WRITE', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('Entendido, lo recordaré.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'recuerda que prefiero TypeScript',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.match(memoryIndex, /prefiero-typescript/i);
    
    const memoryFiles = await readFile(
      path.join(repoRoot, 'memory/prefiero-typescript.md'),
      'utf8',
    );
    assert.match(memoryFiles, /prefiero TypeScript/);
  });

  it('debería_crear_memoria_con_remember_en_inglés', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('Got it.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'remember that I prefer dark mode',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.match(memoryIndex, /prefer-dark-mode/i);
  });

  it('debería_crear_memoria_con_memoriza', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('De acuerdo.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'memoriza que uso Vim como editor',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.match(memoryIndex, /uso-vim-como-editor/i);
  });

  it('NO_debería_crear_memoria_sin_intent_remember', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('TypeScript is great.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'qué opinas de TypeScript',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.doesNotMatch(memoryIndex, /typescript/i);
  });

  it('NO_debería_auto_persistir_si_payload_parece_secreto', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('Entendido.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'recuerda mi token sk-abc123def456',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.doesNotMatch(memoryIndex, /sk-abc123/);
  });

  it('NO_debería_auto_persistir_si_payload_tiene_password', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('OK.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'recuerda mi password es supersecret123',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.doesNotMatch(memoryIndex, /supersecret/);
  });

  it('NO_debería_auto_persistir_si_payload_tiene_path_home', async () => {
    const repoRoot = await makeRepo();
    const { runAgent } = fakeRunner('Noted.');

    await runAgentTurn({
      repoRoot,
      userPrompt: 'recuerda que mi archivo está en /home/usuario/projects',
      runAgent,
    });

    const memoryIndex = await readFile(path.join(repoRoot, 'MEMORY.md'), 'utf8');
    assert.doesNotMatch(memoryIndex, /\/home\/usuario/);
  });
});
