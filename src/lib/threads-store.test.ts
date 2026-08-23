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
  MAX_THREAD_CONTEXT_CHARS,
  MAX_SINGLE_MESSAGE_CHARS,
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

describe('createOrResetThread', () => {
  it('crea un thread vacío con ID específico', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { createOrResetThread } = await import('./threads-store.js');
      const thread = await createOrResetThread(repoRoot, 'telegram-chat-123');
      
      assert.equal(thread.id, 'telegram-chat-123');
      assert.equal(thread.messages.length, 0);
      assert.ok(thread.createdAt);
      assert.equal(thread.createdAt, thread.updatedAt);
      
      // Verificar que se guardó
      const loaded = await loadThread(repoRoot, 'telegram-chat-123');
      assert.ok(loaded);
      assert.equal(loaded.id, 'telegram-chat-123');
      assert.equal(loaded.messages.length, 0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('resetea un thread existente borrando su historial', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { createOrResetThread } = await import('./threads-store.js');
      
      // Crear thread con mensajes
      const thread1 = await createOrResetThread(repoRoot, 'telegram-chat-456');
      await appendToThread(repoRoot, thread1.id, 'user', 'Mensaje 1');
      await appendToThread(repoRoot, thread1.id, 'assistant', 'Respuesta 1');
      
      const loaded1 = await loadThread(repoRoot, 'telegram-chat-456');
      assert.equal(loaded1?.messages.length, 2);
      
      // Reset del thread
      await new Promise((resolve) => setTimeout(resolve, 2));
      const thread2 = await createOrResetThread(repoRoot, 'telegram-chat-456');
      
      assert.equal(thread2.id, 'telegram-chat-456');
      assert.equal(thread2.messages.length, 0);
      assert.ok(
        new Date(thread2.createdAt).getTime() >= new Date(thread1.createdAt).getTime(),
        'createdAt should be updated on reset',
      );
      
      // Verificar que se guardó vacío
      const loaded2 = await loadThread(repoRoot, 'telegram-chat-456');
      assert.equal(loaded2?.messages.length, 0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('ensureThread', () => {
  it('devuelve thread existente sin modificarlo', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { ensureThread } = await import('./threads-store.js');
      
      // Crear thread con mensajes
      const created = await createThread(repoRoot, 'Mensaje inicial');
      await appendToThread(repoRoot, created.id, 'assistant', 'Respuesta');
      
      const ensured = await ensureThread(repoRoot, created.id);
      
      assert.equal(ensured.id, created.id);
      assert.equal(ensured.messages.length, 2);
      assert.equal(ensured.messages[0]?.content, 'Mensaje inicial');
      assert.equal(ensured.messages[1]?.content, 'Respuesta');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('crea thread vacío si no existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { ensureThread } = await import('./threads-store.js');
      
      const ensured = await ensureThread(repoRoot, 'new-thread-789');
      
      assert.equal(ensured.id, 'new-thread-789');
      assert.equal(ensured.messages.length, 0);
      
      // Verificar que se guardó
      const loaded = await loadThread(repoRoot, 'new-thread-789');
      assert.ok(loaded);
      assert.equal(loaded.id, 'new-thread-789');
      assert.equal(loaded.messages.length, 0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('appendToThread con defense in depth', () => {
  it('crea thread automáticamente si no existe al hacer append', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Intentar append sin crear el thread primero
      const updated = await appendToThread(
        repoRoot,
        'auto-created-thread',
        'user',
        'Primer mensaje',
      );
      
      assert.equal(updated.id, 'auto-created-thread');
      assert.equal(updated.messages.length, 1);
      assert.equal(updated.messages[0]?.role, 'user');
      assert.equal(updated.messages[0]?.content, 'Primer mensaje');
      
      // Verificar que se guardó
      const loaded = await loadThread(repoRoot, 'auto-created-thread');
      assert.ok(loaded);
      assert.equal(loaded.messages.length, 1);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('buildThreadContext con límite de caracteres', () => {
  it('respeta el límite de caracteres máximo', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Crear mensajes muy largos que excedan MAX_THREAD_CONTEXT_CHARS
      const largeContent = 'X'.repeat(5000);
      const thread = await createThread(repoRoot, largeContent);
      await appendToThread(repoRoot, thread.id, 'assistant', largeContent);
      await appendToThread(repoRoot, thread.id, 'user', largeContent);
      await appendToThread(repoRoot, thread.id, 'assistant', largeContent);
      
      const context = await buildThreadContext(repoRoot, thread.id, 10);
      
      // El contexto debe respetar el límite
      assert.ok(
        context.length <= MAX_THREAD_CONTEXT_CHARS,
        `Context length ${context.length} exceeds MAX_THREAD_CONTEXT_CHARS ${MAX_THREAD_CONTEXT_CHARS}`,
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('incluye mensajes completos sin cortar a la mitad', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Crear varios mensajes
      const thread = await createThread(repoRoot, 'Mensaje corto 1');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Respuesta corta 1');
      await appendToThread(repoRoot, thread.id, 'user', 'Mensaje corto 2');
      
      // Añadir un mensaje muy largo que hará que se alcance el límite
      const largeContent = 'Z'.repeat(MAX_THREAD_CONTEXT_CHARS);
      await appendToThread(repoRoot, thread.id, 'assistant', largeContent);
      
      const context = await buildThreadContext(repoRoot, thread.id, 10);
      
      // El contexto debe respetar el límite
      assert.ok(context.length <= MAX_THREAD_CONTEXT_CHARS);
      
      // No debe incluir el mensaje largo (porque no cabe completo)
      assert.ok(!context.includes(largeContent));
      
      // Debe incluir los mensajes cortos que sí caben
      assert.ok(context.includes('Mensaje corto'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('maneja correctamente múltiples mensajes dentro del límite', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Inicio');
      
      // Añadir varios mensajes pequeños
      for (let i = 1; i <= 20; i++) {
        await appendToThread(
          repoRoot,
          thread.id,
          i % 2 === 0 ? 'assistant' : 'user',
          `Mensaje ${i}`,
        );
      }
      
      const context = await buildThreadContext(repoRoot, thread.id, 20);
      
      // El contexto debe respetar el límite
      assert.ok(context.length <= MAX_THREAD_CONTEXT_CHARS);
      
      // Debe incluir el mensaje más reciente
      assert.ok(context.includes('Mensaje 20'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('prefiere mensajes más recientes cuando excede el presupuesto', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Crear muchos mensajes con contenido grande que exceda el presupuesto total
      // Cada mensaje con MAX_SINGLE_MESSAGE_CHARS será truncado a ~4014 chars
      // 4 mensajes * 4014 chars = ~16056 chars, que excede MAX_THREAD_CONTEXT_CHARS (14000)
      const largeContent = 'Y'.repeat(MAX_SINGLE_MESSAGE_CHARS);
      const thread = await createThread(repoRoot, `ANTIGUO1: ${largeContent}`);
      await appendToThread(repoRoot, thread.id, 'assistant', `ANTIGUO2: ${largeContent}`);
      await appendToThread(repoRoot, thread.id, 'user', `MEDIO1: ${largeContent}`);
      await appendToThread(repoRoot, thread.id, 'assistant', `MEDIO2: ${largeContent}`);
      await appendToThread(repoRoot, thread.id, 'user', 'Mensaje reciente (debe estar)');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Respuesta reciente (debe estar)');
      
      const context = await buildThreadContext(repoRoot, thread.id, 10);
      
      // El contexto debe respetar el límite
      assert.ok(context.length <= MAX_THREAD_CONTEXT_CHARS);
      
      // Debe incluir los mensajes más recientes
      assert.ok(context.includes('Mensaje reciente (debe estar)'));
      assert.ok(context.includes('Respuesta reciente (debe estar)'));
      
      // Los mensajes más antiguos deben haberse descartado
      assert.ok(!context.includes('ANTIGUO1'));
      assert.ok(!context.includes('ANTIGUO2'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('trunca mensajes individuales enormes con marcador [truncado]', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Crear un mensaje que exceda MAX_SINGLE_MESSAGE_CHARS
      const hugeContent = 'H'.repeat(MAX_SINGLE_MESSAGE_CHARS + 1000);
      const thread = await createThread(repoRoot, hugeContent);
      await appendToThread(repoRoot, thread.id, 'assistant', 'Respuesta corta después del enorme');
      
      const context = await buildThreadContext(repoRoot, thread.id, 10);
      
      // El contexto debe respetar el límite global
      assert.ok(context.length <= MAX_THREAD_CONTEXT_CHARS);
      
      // Debe incluir el marcador de truncado
      assert.ok(context.includes('…[truncado]'));
      
      // Debe incluir la respuesta posterior (no consumida por el mensaje enorme)
      assert.ok(context.includes('Respuesta corta después del enorme'));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('intenta mantener intercambios completos (user+assistant)', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Crear pares de mensajes
      const thread = await createThread(repoRoot, 'Pregunta 1');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Respuesta 1');
      await appendToThread(repoRoot, thread.id, 'user', 'Pregunta 2');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Respuesta 2');
      
      const context = await buildThreadContext(repoRoot, thread.id, 5);
      
      // Debe incluir ambos pares completos
      const hasPregunta1 = context.includes('Pregunta 1');
      const hasRespuesta1 = context.includes('Respuesta 1');
      const hasPregunta2 = context.includes('Pregunta 2');
      const hasRespuesta2 = context.includes('Respuesta 2');
      
      // Si incluye una pregunta, debe incluir su respuesta (y viceversa)
      if (hasPregunta1 || hasRespuesta1) {
        assert.ok(hasPregunta1 && hasRespuesta1, 'Par 1 debe estar completo');
      }
      if (hasPregunta2 || hasRespuesta2) {
        assert.ok(hasPregunta2 && hasRespuesta2, 'Par 2 debe estar completo');
      }
      
      // El par más reciente debe estar incluido
      assert.ok(hasPregunta2 && hasRespuesta2);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('contexto vacío si thread no existe o está vacío', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      // Thread inexistente
      const context1 = await buildThreadContext(repoRoot, 'no-existe');
      assert.equal(context1, '');
      
      // Thread vacío
      const { createOrResetThread } = await import('./threads-store.js');
      const emptyThread = await createOrResetThread(repoRoot, 'vacio');
      const context2 = await buildThreadContext(repoRoot, emptyThread.id);
      assert.equal(context2, '');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('orden cronológico (oldest→newest) en salida final', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Primero');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Segundo');
      await appendToThread(repoRoot, thread.id, 'user', 'Tercero');
      await appendToThread(repoRoot, thread.id, 'assistant', 'Cuarto');
      
      const context = await buildThreadContext(repoRoot, thread.id, 5);
      
      // Verificar orden: Primero debe aparecer antes que Cuarto
      const idxPrimero = context.indexOf('Primero');
      const idxCuarto = context.indexOf('Cuarto');
      
      assert.ok(idxPrimero !== -1 && idxCuarto !== -1);
      assert.ok(idxPrimero < idxCuarto, 'Orden debe ser cronológico');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('deleteThread', () => {
  it('elimina un thread existente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { deleteThread } = await import('./threads-store.js');
      const thread = await createThread(repoRoot, 'Mensaje a eliminar');
      
      const deleted = await deleteThread(repoRoot, thread.id);
      assert.equal(deleted, true);
      
      const loaded = await loadThread(repoRoot, thread.id);
      assert.equal(loaded, undefined);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('devuelve false si el thread no existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { deleteThread } = await import('./threads-store.js');
      const deleted = await deleteThread(repoRoot, 'thread-no-existe');
      assert.equal(deleted, false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('rechaza threadId con path traversal', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const { deleteThread } = await import('./threads-store.js');
      
      const malicious1 = await deleteThread(repoRoot, '../../../etc/passwd');
      assert.equal(malicious1, false);
      
      const malicious2 = await deleteThread(repoRoot, 'thread-../other');
      assert.equal(malicious2, false);
      
      const malicious3 = await deleteThread(repoRoot, 'thread\\windows');
      assert.equal(malicious3, false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
