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
  renameThread,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREAD_CONTEXT_CHARS,
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
});

describe('renameThread', () => {
  it('renombra un thread existente', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial');
      
      const renamed = await renameThread(repoRoot, thread.id, 'Nuevo título');
      assert.ok(renamed);
      assert.equal(renamed.title, 'Nuevo título');
      assert.equal(renamed.id, thread.id);
      
      const loaded = await loadThread(repoRoot, thread.id);
      assert.ok(loaded);
      assert.equal(loaded.title, 'Nuevo título');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('devuelve undefined si el thread no existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const renamed = await renameThread(repoRoot, 'thread-no-existe', 'Título');
      assert.equal(renamed, undefined);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('rechaza threadId con path traversal', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const malicious1 = await renameThread(repoRoot, '../../../etc/passwd', 'Título');
      assert.equal(malicious1, undefined);
      
      const malicious2 = await renameThread(repoRoot, 'thread-../other', 'Título');
      assert.equal(malicious2, undefined);
      
      const malicious3 = await renameThread(repoRoot, 'thread\\windows', 'Título');
      assert.equal(malicious3, undefined);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('rechaza títulos vacíos', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial');
      
      const empty1 = await renameThread(repoRoot, thread.id, '');
      assert.equal(empty1, undefined);
      
      const empty2 = await renameThread(repoRoot, thread.id, '   ');
      assert.equal(empty2, undefined);
      
      const loaded = await loadThread(repoRoot, thread.id);
      assert.ok(loaded);
      assert.equal(loaded.title, undefined);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('trunca títulos largos a 80 caracteres', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial');
      const longTitle = 'a'.repeat(100);
      
      const renamed = await renameThread(repoRoot, thread.id, longTitle);
      assert.ok(renamed);
      assert.equal(renamed.title?.length, 80);
      assert.equal(renamed.title, 'a'.repeat(80));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('recorta espacios en blanco del título', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial');
      
      const renamed = await renameThread(repoRoot, thread.id, '  Título con espacios  ');
      assert.ok(renamed);
      assert.equal(renamed.title, 'Título con espacios');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('actualiza updatedAt al renombrar', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial');
      const originalUpdatedAt = thread.updatedAt;
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      const renamed = await renameThread(repoRoot, thread.id, 'Nuevo título');
      assert.ok(renamed);
      assert.ok(
        new Date(renamed.updatedAt).getTime() > new Date(originalUpdatedAt).getTime(),
        'updatedAt should be updated after rename',
      );
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

  it('listThreads usa título almacenado si existe', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      const thread = await createThread(repoRoot, 'Mensaje inicial que es largo y debería truncarse');
      await renameThread(repoRoot, thread.id, 'Título personalizado');
      
      const summaries = await listThreads(repoRoot);
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0]?.title, 'Título personalizado');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('listThreads usa extractTitle si no hay título almacenado', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'threads-test-'));
    try {
      await createThread(repoRoot, 'Mensaje sin título personalizado');
      
      const summaries = await listThreads(repoRoot);
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0]?.title, 'Mensaje sin título personalizado');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
