/**
 * HTML shell builders for dashboard body elements.
 * Each function returns a complete <body> element with the appropriate mode.
 */

import { observeClientScript } from './client-observe.js';
import { chatClientScript } from './client-chat.js';

/** Escapes text for safe HTML text nodes / attributes. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Renders the <body> shell for observe (read-only) mode.
 * Includes theme toggle button in header.
 */
export function renderObserveShell(options: {
  readonly generatedAt: string;
  readonly agentSection: string;
  readonly cronSection: string;
  readonly memorySection: string;
}): string {
  return `<body class="mode-observe">
  <header class="top">
    <div style="display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
      <div style="flex: 1;">
        <h1>cursor-native-agent · observar</h1>
        <p>Dashboard local de solo lectura. Muestra turnos recientes del agente, hallazgos de cron y el índice MEMORY.md. No ejecuta el agente ni escribe archivos.</p>
        <div class="meta">generado ${escapeHtml(options.generatedAt)} · recarga la página para actualizar</div>
      </div>
      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Cambiar tema">
        <span class="theme-toggle-icon">◐</span>
        <span class="theme-toggle-label">Tema</span>
      </button>
    </div>
  </header>
  <main class="observe-main">
${options.agentSection}
${options.cronSection}
${options.memorySection}
  </main>
  <footer>Solo GET · sin rutas de escritura · PORT vía env</footer>
  <script>
${observeClientScript()}
  </script>
</body>`;
}

/**
 * Renders the <body> shell for chat (interactive) mode.
 * Includes unlock modal, sidebar with thread management, and theme toggle button.
 */
export function renderChatShell(options: {
  readonly generatedAt: string;
  readonly agentSection: string;
  readonly cronSection: string;
  readonly memorySection: string;
}): string {
  return `<body class="mode-chat">
  <div class="unlock-modal" id="unlock-modal">
    <div class="unlock-card">
      <h2>Autenticación requerida</h2>
      <p>El dashboard necesita el token de autenticación para enviar mensajes al agente.</p>
      <p>El token está en <code>.env</code> como <code>DASHBOARD_TOKEN</code> (después de <code>npm run setup</code>).</p>
      <input type="password" id="unlock-input" placeholder="Ingresá el token" autocomplete="off" />
      <button type="button" id="unlock-btn">Desbloquear</button>
      <p class="unlock-hint">El token se guarda en sessionStorage y nunca sale del navegador.</p>
    </div>
  </div>
  <div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Observatorio">
      <div class="sidebar-brand">
        <strong>cursor-native-agent</strong>
        <span class="meta">chat · ${escapeHtml(options.generatedAt)}</span>
      </div>
      <nav class="sidebar-nav" aria-label="Paneles">
        <button type="button" class="side-tab is-active" data-panel="threads">Hilos</button>
        <button type="button" class="side-tab" data-panel="agent">Turnos</button>
        <button type="button" class="side-tab" data-panel="cron">Cron</button>
        <button type="button" class="side-tab" data-panel="memory">Memoria</button>
      </nav>
      <div class="sidebar-panels">
        <div class="side-panel is-active" data-panel="threads">
          <p class="panel-hint">Conversaciones del chat</p>
          <button type="button" class="button" id="new-thread-btn-sidebar">Nueva conversación</button>
          <div id="threads-list-panel"></div>
        </div>
        <div class="side-panel" data-panel="agent">${options.agentSection}</div>
        <div class="side-panel" data-panel="cron">${options.cronSection}</div>
        <div class="side-panel" data-panel="memory">${options.memorySection}</div>
      </div>
    </aside>
    <div class="chat-column">
      <header class="chat-top">
        <button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-controls="sidebar" aria-expanded="true">Paneles</button>
        <div style="flex: 1;">
          <h1>Chat</h1>
          <p class="chat-sub" id="chat-thread-indicator">Sin hilo activo</p>
        </div>
        <button type="button" class="button-new-thread" id="new-thread-btn-header">Nueva conversación</button>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Cambiar tema">
          <span class="theme-toggle-icon">◐</span>
          <span class="theme-toggle-label">Tema</span>
        </button>
      </header>
      <div class="info-banner" role="status">
        POST /api/chat · SSE · mismo pipeline que <span class="mono">npm run agent</span> · Confirmar antes de escribir en el workspace · --trust · sesión local en <span class="mono">127.0.0.1</span>
      </div>
      <div class="chat-log" id="chat-log" aria-live="polite">
        <div class="chat-empty" id="chat-empty">
          <p>Preguntale al agente lo que quieras.</p>
          <p class="chat-empty-hint">
            <strong>@ Menciones:</strong> <code>@src/file.ts</code> incluye archivos · <code>@folder/</code> lista directorios<br>
            <strong>/ Comandos:</strong> <code>/help</code> · <code>/skill-name args</code><br>
            <strong>📎 Adjuntar:</strong> Clic o arrastrá archivos (análisis local, sin subir a servidor externo)
          </p>
        </div>
      </div>
      <form class="composer" id="chat-form">
        <div class="composer-attachments" id="attach-container" style="display:none">
          <div class="attach-list" id="attach-list"></div>
        </div>
        <div class="composer-shell" id="chat-area">
          <button type="button" id="attach-btn" class="attach-btn" aria-label="Adjuntar archivo" title="Adjuntar archivos (clic o arrastrá aquí)">📎</button>
          <textarea id="chat-input" name="prompt" rows="1" autocomplete="off" placeholder="Mensaje al agente… (@ para archivos, / para comandos)" required></textarea>
          <button type="submit" id="chat-send" aria-label="Enviar">Enviar</button>
        </div>
        <p class="composer-hint">
          Enter para enviar · Shift+Enter para nueva línea<br>
          <span class="hint-muted">@ para archivos · / para comandos · 📎 para adjuntar (o arrastrá)</span>
        </p>
      </form>
    </div>
  </div>
  <script>
${chatClientScript()}
  </script>
</body>`;
}
