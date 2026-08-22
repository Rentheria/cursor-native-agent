import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createThread,
  loadThread,
  appendToThread,
  listThreads,
  buildThreadContext,
  generateThreadId,
  getThreadsDir,
  MAX_MESSAGES_PER_THREAD,
  type Thread,
} from './threads-store.js';

describe('threads-store', () => {
  it('genera IDs únicos de thread', () => {
    const id1 = generateThreadId();
    const id2 = generateThreadId();
    assert.ok(id1.startsWith('thread-'));
    assert.ok(id2.startsWith('thread-'));
    assert.notEqual(id1, id2);
  });

  it('devuelve la ruta del directorio de threads', () => {
    const repoRoot = '/home/you/repo';
    const threadsDir = getThreadsDir(repoRoot);
    assert.equal(threadsDir, '/home/you/repo/threads');
  });

  it('crea un nuevo thread con mensaje inicial', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Hola, ¿cómo estás?');
      assert.ok(thread.id.startsWith('thread-'));
      assert.equal(thread.messages.length, 1);
      assert.equal(thread.messages[0]?.role, 'user');
      assert.equal(thread.messages[0]?.content, 'Hola, ¿cómo estás?');
      assert.ok(thread.createdAt);
      assert.equal(thread.createdAt, thread.updatedAt);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('carga un thread existente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const created = await createThread(repoRoot, 'Mensaje inicial');
      const loaded = await loadThread(repoRoot, created.id);
      assert.ok(loaded);
      assert.equal(loaded.id, created.id);
      assert.equal(loaded.messages.length, 1);
      assert.equal(loaded.messages[0]?.content, 'Mensaje inicial');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('devuelve undefined si el thread no existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const loaded = await loadThread(repoRoot, 'thread-inexistente');
      assert.equal(loaded, undefined);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('añade mensajes a un thread existente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, '¿Qué es este repo?');
      // Pequeño delay para asegurar timestamps diferentes
      await new Promise((resolve) => setTimeout(resolve, 2));
      const updated1 = await appendToThread(
        repoRoot,
        thread.id,
        'assistant',
        'Este repo es cursor-native-agent.',
      );
      assert.equal(updated1.messages.length, 2);
      assert.equal(updated1.messages[1]?.role, 'assistant');
      assert.equal(updated1.messages[1]?.content, 'Este repo es cursor-native-agent.');
      assert.ok(
        new Date(updated1.updatedAt).getTime() >= new Date(thread.updatedAt).getTime(),
        'updatedAt should be >= original timestamp',
      );

      const updated2 = await appendToThread(
        repoRoot,
        thread.id,
        'user',
        '¿Qué hace?',
      );
      assert.equal(updated2.messages.length, 3);
      assert.equal(updated2.messages[2]?.role, 'user');
      assert.equal(updated2.messages[2]?.content, '¿Qué hace?');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('limita los mensajes a MAX_MESSAGES_PER_THREAD', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje 1');
      let current: Thread = thread;

      // Añadir MAX_MESSAGES_PER_THREAD mensajes adicionales
      for (let i = 2; i <= MAX_MESSAGES_PER_THREAD + 1; i++) {
        current = await appendToThread(
          repoRoot,
          current.id,
          i % 2 === 0 ? 'assistant' : 'user',
          `Mensaje ${i}`,
        );
      }

      assert.equal(current.messages.length, MAX_MESSAGES_PER_THREAD);
      // El primer mensaje debe haber sido eliminado
      assert.notEqual(current.messages[0]?.content, 'Mensaje 1');
      // El último mensaje debe estar presente
      assert.equal(
        current.messages[current.messages.length - 1]?.content,
        `Mensaje ${MAX_MESSAGES_PER_THREAD + 1}`,
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('lista todos los threads ordenados por updatedAt descendente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread1 = await createThread(repoRoot, 'Thread 1');
      // Pequeño delay para asegurar updatedAt diferente
      await new Promise((resolve) => setTimeout(resolve, 10));
      const thread2 = await createThread(repoRoot, 'Thread 2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Actualizar thread1 para que sea el más reciente
      await appendToThread(repoRoot, thread1.id, 'assistant', 'Respuesta');

      const summaries = await listThreads(repoRoot);
      assert.equal(summaries.length, 2);
      // thread1 debe estar primero (más reciente)
      assert.equal(summaries[0]?.id, thread1.id);
      assert.equal(summaries[0]?.title, 'Thread 1');
      assert.equal(summaries[0]?.messageCount, 2);
      assert.equal(summaries[1]?.id, thread2.id);
      assert.equal(summaries[1]?.title, 'Thread 2');
      assert.equal(summaries[1]?.messageCount, 1);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('devuelve lista vacía cuando no hay threads', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const summaries = await listThreads(repoRoot);
      assert.equal(summaries.length, 0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('construye contexto de conversación reciente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, '¿Qué es esto?');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Es un agente.');
      await appendToThread(repoRoot, thread.id, 'user', '¿Cómo funciona?');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Usa cursor-agent.');

      const context = await buildThreadContext(repoRoot, thread.id, 5);
      assert.ok(context.includes('¿Qué es esto?'));
      assert.ok(context.includes('Es un agente.'));
      assert.ok(context.includes('¿Cómo funciona?'));
      assert.ok(context.includes('Usa cursor-agent.'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('limita el contexto a últimos N intercambios', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const created = await createThread(repoRoot, 'Msg 1');
      await appendToThread(repoRoot, created.id, 'assistant', 'Resp 1');
      await appendToThread(repoRoot, created.id, 'user', 'Msg 2');
      await appendToThread(repoRoot, created.id, 'assistant', 'Resp 2');
      await appendToThread(repoRoot, created.id, 'user', 'Msg 3');
      await appendToThread(repoRoot, created.id, 'assistant', 'Resp 3');

      const context = await buildThreadContext(repoRoot, created.id, 1);
      // Solo debe incluir el último intercambio (Msg 3 + Resp 3)
      assert.ok(!context.includes('Msg 1'));
      assert.ok(!context.includes('Msg 2'));
      assert.ok(context.includes('Msg 3'));
      assert.ok(context.includes('Resp 3'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('devuelve contexto vacío si el thread no existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const context = await buildThreadContext(repoRoot, 'thread-inexistente');
      assert.equal(context, '');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('trunca títulos largos', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const longMessage = 'Este es un mensaje muy largo que debería ser truncado en el título porque excede el límite de 60 caracteres';
      await createThread(repoRoot, longMessage);
      const summaries = await listThreads(repoRoot);
      assert.equal(summaries.length, 1);
      const firstSummary = summaries[0];
      assert.ok(firstSummary !== undefined);
      assert.ok(firstSummary.title.length <= 61); // 60 + '…'
      assert.ok(firstSummary.title.endsWith('…'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
