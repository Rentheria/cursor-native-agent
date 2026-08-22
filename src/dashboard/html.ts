import type {
  AgentTurnSummary,
  MemoryIndexEntry,
  ParsedCronFinding,
} from './parse-logs.js';

export type DashboardSnapshot = {
  readonly generatedAt: string;
  readonly agentTurns: readonly AgentTurnSummary[];
  readonly cronFindings: readonly ParsedCronFinding[];
  readonly memoryEntries: readonly MemoryIndexEntry[];
  readonly memoryRaw: string;
  readonly sources: {
    readonly agentPath: string;
    readonly cronPath: string;
    readonly memoryPath: string;
  };
  /** When true, render the opt-in chat UI (POST /api/chat). */
  readonly chatEnabled?: boolean;
};

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
 * Formats an ISO timestamp into a human-friendly relative time or time of day.
 * Examples: "9:31", "hace 2 min", "ayer 14:30"
 */
export function formatTimestamp(isoTimestamp: string, now = new Date()): string {
  try {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) {
      return isoTimestamp;
    }

    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return 'ahora';
    }
    if (diffMinutes < 60) {
      return `hace ${diffMinutes} min`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `ayer ${hours}:${minutes}`;
    }

    if (diffDays < 7) {
      return `hace ${diffDays} días`;
    }

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  } catch {
    return isoTimestamp;
  }
}

/**
 * Renders the details view for an expanded turn.
 */
function renderTurnDetails(turn: AgentTurnSummary): string {
  const sections: string[] = [];

  sections.push(`<div class="turn-detail-section">
    <h3 class="turn-detail-label">Prompt completo</h3>
    <p class="turn-detail-value turn-prompt-full">${escapeHtml(turn.prompt)}</p>
  </div>`);

  if (turn.skillsMatched.length > 0) {
    sections.push(`<div class="turn-detail-section">
      <h3 class="turn-detail-label">Skills</h3>
      <p class="turn-detail-value">${escapeHtml(turn.skillsMatched.join(', '))}</p>
    </div>`);
  }

  if (turn.memoryIndexEntries > 0 || turn.memoryLoadedDetails.length > 0) {
    const memoryInfo = turn.memoryLoadedDetails.length > 0
      ? `${turn.memoryIndexEntries} entradas · detalles: ${turn.memoryLoadedDetails.join(', ')}`
      : `${turn.memoryIndexEntries} entradas`;
    sections.push(`<div class="turn-detail-section">
      <h3 class="turn-detail-label">Memoria</h3>
      <p class="turn-detail-value">${escapeHtml(memoryInfo)}</p>
    </div>`);
  }

  const performanceItems: string[] = [];
  if (turn.cursorAgentMs !== undefined) {
    performanceItems.push(`cursor-agent: ${turn.cursorAgentMs}ms`);
  }
  if (turn.totalMs !== undefined) {
    performanceItems.push(`total: ${turn.totalMs}ms`);
  }
  if (performanceItems.length > 0) {
    sections.push(`<div class="turn-detail-section">
      <h3 class="turn-detail-label">Performance</h3>
      <p class="turn-detail-value mono">${escapeHtml(performanceItems.join(' · '))}</p>
    </div>`);
  }

  sections.push(`<div class="turn-detail-section">
    <h3 class="turn-detail-label">Timestamp</h3>
    <p class="turn-detail-value mono">${escapeHtml(turn.ts)}</p>
  </div>`);

  return sections.join('\n');
}

/** Renders the observability page (server-side). Chat UI only when enabled. */
export function renderDashboardHtml(snapshot: DashboardSnapshot): string {
  const chatEnabled = snapshot.chatEnabled === true;
  const generatedAt = new Date(snapshot.generatedAt);
  
  const agentRows = snapshot.agentTurns.map((turn, index) => {
    const humanTime = formatTimestamp(turn.ts, generatedAt);
    const promptPreview = truncate(turn.prompt, 100);
    const hasSkills = turn.skillsMatched.length > 0;
    const skillsBadge = hasSkills
      ? `<span class="turn-badge">${escapeHtml(turn.skillsMatched[0] ?? '')}</span>`
      : '';
    
    const detailsContent = renderTurnDetails(turn);
    
    return `<article class="turn-item" data-turn-index="${index}" data-turn-prompt="${escapeHtml(turn.prompt)}" ${turn.reply !== undefined ? `data-turn-reply="${escapeHtml(turn.reply)}"` : ''}>
      <button type="button" class="turn-header" data-turn-id="${index}" aria-expanded="false">
        <div class="turn-header-main">
          <span class="turn-time">${escapeHtml(humanTime)}</span>
          ${skillsBadge}
        </div>
        <p class="turn-prompt-preview">${escapeHtml(promptPreview)}</p>
      </button>
      <div class="turn-details" data-turn-id="${index}" hidden>
        ${detailsContent}
      </div>
    </article>`;
  }).join('\n');

  const cronCards = snapshot.cronFindings.map((finding) => {
    const verdictClass =
      finding.verdict?.startsWith('READY') === true
        ? 'verdict-ready'
        : finding.verdict?.startsWith('DIRTY') === true
          ? 'verdict-dirty'
          : '';
    return `<article class="finding">
      <header>
        <span class="mono">${escapeHtml(finding.startedAt)}</span>
        <span class="badge ${verdictClass}">${escapeHtml(finding.verdict ?? '—')}</span>
      </header>
      <dl>
        <div><dt>branch</dt><dd>${escapeHtml(finding.branch ?? '—')}</dd></div>
        <div><dt>latest</dt><dd>${escapeHtml(finding.latest ?? '—')}</dd></div>
        <div><dt>tree</dt><dd>${escapeHtml(finding.tree ?? '—')}</dd></div>
        <div><dt>exit</dt><dd>${escapeHtml(finding.exitCode === undefined ? '—' : String(finding.exitCode))}</dd></div>
        <div class="note"><dt>note</dt><dd>${escapeHtml(finding.note ?? '—')}</dd></div>
      </dl>
    </article>`;
  }).join('\n');

  const memoryItems =
    snapshot.memoryEntries.length > 0
      ? snapshot.memoryEntries
          .map(
            (entry) =>
              `<li>
                <strong>${escapeHtml(entry.title)}</strong>
                <span class="mono path">${escapeHtml(entry.href)}</span>
                <span class="keywords">${escapeHtml(entry.keywords)}</span>
              </li>`,
          )
          .join('\n')
      : '<li class="empty">Sin entradas de índice parseadas de MEMORY.md</li>';

  const agentSection = `
    <section class="panel" aria-labelledby="agent-heading">
      <h2 id="agent-heading">Turnos del agente</h2>
      <p class="source">${escapeHtml(snapshot.sources.agentPath)} · newest ${String(snapshot.agentTurns.length)}</p>
      ${
        snapshot.agentTurns.length === 0
          ? '<p class="empty">Sin entradas en agent.ndjson todavía.</p>'
          : `<div class="turns-list">${agentRows}</div>`
      }
    </section>`;

  const cronSection = `
    <section class="panel" aria-labelledby="cron-heading">
      <h2 id="cron-heading">Hallazgos de cron</h2>
      <p class="source">${escapeHtml(snapshot.sources.cronPath)} · newest ${String(snapshot.cronFindings.length)}</p>
      <div class="findings">
        ${
          snapshot.cronFindings.length === 0
            ? '<p class="empty">Sin bloques CRON FINDING parseados todavía.</p>'
            : cronCards
        }
      </div>
    </section>`;

  const memorySection = `
    <section class="panel" aria-labelledby="memory-heading">
      <h2 id="memory-heading">MEMORY.md index</h2>
      <p class="source">${escapeHtml(snapshot.sources.memoryPath)} · ${String(snapshot.memoryEntries.length)} entr${snapshot.memoryEntries.length === 1 ? 'y' : 'ies'}</p>
      <ul class="memory-list">
${memoryItems}
      </ul>
    </section>`;

  const body = chatEnabled
    ? renderChatShell({
        generatedAt: snapshot.generatedAt,
        agentSection,
        cronSection,
        memorySection,
      })
    : renderObserveShell({
        generatedAt: snapshot.generatedAt,
        agentSection,
        cronSection,
        memorySection,
      });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cursor-native-agent — ${chatEnabled ? 'chat' : 'observe'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
${sharedStyles()}
${chatEnabled ? chatStyles() : observeStyles()}
  </style>
</head>
${body}
</html>`;
}

function renderObserveShell(options: {
  readonly generatedAt: string;
  readonly agentSection: string;
  readonly cronSection: string;
  readonly memorySection: string;
}): string {
  return `<body class="mode-observe">
  <header class="top">
    <h1>cursor-native-agent · observe</h1>
    <p>Read-only local dashboard. Shows recent agent turns, cron findings, and the MEMORY.md index. Does not run the agent or write files.</p>
    <div class="meta">generated ${escapeHtml(options.generatedAt)} · refresh the page to reload</div>
  </header>
  <main class="observe-main">
${options.agentSection}
${options.cronSection}
${options.memorySection}
  </main>
  <footer>GET only · no write routes · PORT via env</footer>
  <script>
${observeClientScript()}
  </script>
</body>`;
}

function renderChatShell(options: {
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
    <aside class="sidebar" id="sidebar" aria-label="Observatory">
      <div class="sidebar-brand">
        <strong>cursor-native-agent</strong>
        <span class="meta">observe · ${escapeHtml(options.generatedAt)}</span>
      </div>
      <nav class="sidebar-nav" aria-label="Panels">
        <button type="button" class="side-tab is-active" data-panel="agent">Turnos</button>
        <button type="button" class="side-tab" data-panel="threads">Hilos</button>
        <button type="button" class="side-tab" data-panel="cron">Cron</button>
        <button type="button" class="side-tab" data-panel="memory">Memoria</button>
      </nav>
      <div class="sidebar-panels">
        <div class="side-panel is-active" data-panel="agent">${options.agentSection}</div>
        <div class="side-panel" data-panel="threads">
          <button type="button" class="button" id="new-thread-btn">Nueva conversación</button>
          <div id="threads-list-panel"></div>
        </div>
        <div class="side-panel" data-panel="cron">${options.cronSection}</div>
        <div class="side-panel" data-panel="memory">${options.memorySection}</div>
      </div>
    </aside>
    <div class="chat-column">
      <header class="chat-top">
        <button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-controls="sidebar" aria-expanded="true">Paneles</button>
        <div>
          <h1>Chat</h1>
          <p class="chat-sub">POST /api/chat · SSE · mismo pipeline que <span class="mono">npm run agent</span></p>
        </div>
      </header>
      <div class="info-banner" role="status">
        Confirmar escribe archivos bajo workspace/ · modo seguro + trust · token requerido · solo <span class="mono">127.0.0.1</span>
      </div>
      <div class="chat-log" id="chat-log" aria-live="polite">
        <div class="chat-empty" id="chat-empty">
          <p>Preguntale al agente lo que quieras.</p>
          <p class="chat-empty-hint">Por ejemplo: "qué hace este repo"</p>
        </div>
      </div>
      <form class="composer" id="chat-form">
        <div class="composer-shell">
          <textarea id="chat-input" name="prompt" rows="1" autocomplete="off" placeholder="Mensaje al agente…" required></textarea>
          <button type="submit" id="chat-send" aria-label="Enviar">Enviar</button>
        </div>
        <p class="composer-hint">Enter para enviar · Shift+Enter para nueva línea</p>
      </form>
    </div>
  </div>
  <script>
${chatClientScript()}
  </script>
</body>`;
}

function sharedStyles(): string {
  return `
    :root {
      --ink: #15201c;
      --muted: #5a6b64;
      --line: #c9d2cb;
      --panel: #f3f6f2;
      --paper: #e7ece7;
      --surface: #ffffff;
      --accent: #0b6b5c;
      --accent-soft: #d3ebe5;
      --user-bubble: #0b6b5c;
      --user-ink: #f5fffb;
      --assistant-bubble: #ffffff;
      --warn: #8a4b12;
      --warn-soft: #f5e6d2;
      --danger-soft: #f3d9d4;
      --mono: "IBM Plex Mono", "ui-monospace", "Cascadia Code", monospace;
      --sans: "IBM Plex Sans", "Segoe UI", sans-serif;
      --sidebar-w: 22rem;
      --radius: 1.1rem;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--ink);
      background: var(--paper);
      line-height: 1.45;
    }
    .mono { font-family: var(--mono); font-size: 0.8rem; }
    .empty, .empty-row {
      color: var(--muted);
      font-style: italic;
      padding: 0.5rem 0;
    }
    .source {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      margin: -0.35rem 0 0.75rem;
    }
    .panel h2 {
      margin: 0 0 0.65rem;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    th, td {
      text-align: left;
      padding: 0.4rem 0.45rem;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-family: var(--mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      font-weight: 500;
    }
    td.prompt { word-break: break-word; }
    .turns-list {
      display: grid;
      gap: 0.5rem;
    }
    .turn-item {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      overflow: hidden;
    }
    .turn-header {
      width: 100%;
      text-align: left;
      padding: 0.7rem 0.85rem;
      border: none;
      background: transparent;
      cursor: pointer;
      font: inherit;
      color: inherit;
      display: grid;
      gap: 0.35rem;
      transition: background 120ms ease;
    }
    .turn-header:hover {
      background: color-mix(in srgb, var(--accent) 4%, transparent);
    }
    .turn-header[aria-expanded="true"] {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
      border-bottom: 1px solid var(--line);
    }
    .turn-header-main {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .turn-time {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 500;
    }
    .turn-badge {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 0.12rem 0.4rem;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--line));
    }
    .turn-prompt-preview {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.4;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .turn-details {
      padding: 0.85rem;
      background: color-mix(in srgb, var(--panel) 40%, transparent);
      border-top: 1px solid var(--line);
      display: grid;
      gap: 0.65rem;
    }
    .turn-details[hidden] {
      display: none;
    }
    .turn-detail-section {
      display: grid;
      gap: 0.25rem;
    }
    .turn-detail-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      font-weight: 500;
      margin: 0;
    }
    .turn-detail-value {
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.5;
      word-break: break-word;
    }
    .turn-prompt-full {
      white-space: pre-wrap;
      font-size: 0.88rem;
    }
    .findings { display: grid; gap: 0.65rem; }
    .finding {
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 0.65rem 0.75rem;
      border-radius: 0.55rem;
    }
    .finding header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem 0.85rem;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.45rem;
    }
    .finding dl {
      margin: 0;
      display: grid;
      gap: 0.2rem 0.85rem;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      font-size: 0.82rem;
    }
    .finding dt {
      font-family: var(--mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .finding dd { margin: 0.08rem 0 0; }
    .finding .note { grid-column: 1 / -1; }
    .badge {
      font-family: var(--mono);
      font-size: 0.7rem;
      padding: 0.12rem 0.4rem;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 999px;
    }
    .verdict-ready {
      background: var(--accent-soft);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
      color: var(--accent);
    }
    .verdict-dirty {
      background: var(--warn-soft);
      border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
      color: var(--warn);
    }
    .memory-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.55rem;
    }
    .memory-list li {
      display: grid;
      gap: 0.12rem;
      padding: 0.5rem 0.6rem;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 0.55rem;
    }
    .memory-list .path { color: var(--muted); font-size: 0.74rem; }
    .memory-list .keywords { font-size: 0.82rem; }
  `;
}

function observeStyles(): string {
  return `
    body.mode-observe {
      background:
        radial-gradient(ellipse 80% 50% at 10% -10%, #d5e8e2 0%, transparent 55%),
        linear-gradient(180deg, #dfe6df 0%, var(--paper) 40%, #dde3d8 100%);
      min-height: 100vh;
    }
    header.top {
      padding: 1.75rem clamp(1rem, 3vw, 2.5rem) 1rem;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 88%, transparent);
      backdrop-filter: blur(6px);
    }
    header.top h1 {
      margin: 0;
      font-size: clamp(1.35rem, 2.5vw, 1.75rem);
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    header.top p {
      margin: 0.35rem 0 0;
      color: var(--muted);
      max-width: 42rem;
      font-size: 0.95rem;
    }
    .meta {
      margin-top: 0.75rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
    }
    .observe-main {
      padding: 1.25rem clamp(1rem, 3vw, 2.5rem) 3rem;
      display: grid;
      gap: 1.5rem;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 2px;
      padding: 1rem 1.1rem 1.15rem;
    }
    footer {
      padding: 0 0 2rem;
      text-align: center;
      font-size: 0.78rem;
      color: var(--muted);
      font-family: var(--mono);
    }
  `;
}

function chatStyles(): string {
  return `
    .unlock-modal {
      position: fixed;
      inset: 0;
      background: color-mix(in srgb, var(--ink) 25%, transparent);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .unlock-modal.is-visible {
      display: flex;
    }
    .unlock-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 1.5rem 1.75rem;
      max-width: 28rem;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 15%, transparent);
    }
    .unlock-card h2 {
      margin: 0 0 0.75rem;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--ink);
    }
    .unlock-card p {
      margin: 0 0 0.65rem;
      font-size: 0.92rem;
      line-height: 1.5;
      color: var(--ink);
    }
    .unlock-card code {
      font-family: var(--mono);
      font-size: 0.85em;
      background: var(--panel);
      padding: 0.15rem 0.35rem;
      border-radius: 0.3rem;
    }
    .unlock-card input {
      width: 100%;
      padding: 0.65rem 0.75rem;
      font: inherit;
      font-size: 0.95rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      background: var(--surface);
      margin: 0.75rem 0 0.65rem;
    }
    .unlock-card button {
      width: 100%;
      padding: 0.65rem;
      font: inherit;
      font-weight: 600;
      font-size: 0.95rem;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
    }
    .unlock-hint {
      margin-top: 0.65rem !important;
      font-size: 0.8rem !important;
      color: var(--muted) !important;
    }
    .confirm-actions {
      display: flex;
      gap: 0.55rem;
      margin-top: 0.65rem;
    }
    .confirm-btn {
      font: inherit;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 999px;
      cursor: pointer;
    }
    .confirm-btn.ok {
      background: var(--accent);
      color: #fff;
    }
    .confirm-btn.no {
      background: var(--line);
      color: var(--ink);
    }
    .confirm-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    body.mode-chat {
      overflow: hidden;
      background:
        linear-gradient(160deg, #d9e5df 0%, var(--paper) 42%, #d5ddd6 100%);
    }
    .app {
      display: grid;
      grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
      height: 100vh;
      height: 100dvh;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 92%, #fff);
      min-height: 0;
    }
    .sidebar-brand {
      padding: 1rem 1rem 0.75rem;
      display: grid;
      gap: 0.2rem;
      border-bottom: 1px solid var(--line);
    }
    .sidebar-brand strong {
      font-size: 0.95rem;
      letter-spacing: -0.02em;
    }
    .sidebar-brand .meta {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
    }
    .sidebar-nav {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.35rem;
      padding: 0.75rem;
      border-bottom: 1px solid var(--line);
    }
    .side-tab {
      font: inherit;
      font-size: 0.78rem;
      font-weight: 500;
      padding: 0.4rem 0.35rem;
      border: 1px solid transparent;
      border-radius: 0.55rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .side-tab.is-active {
      background: var(--surface);
      border-color: var(--line);
      color: var(--ink);
      box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
    }
    .sidebar-panels {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 0.75rem;
    }
    .side-panel { display: none; }
    .side-panel.is-active { display: block; }
    .side-panel .panel {
      background: transparent;
      border: none;
      padding: 0;
    }
    .table-wrap { overflow-x: auto; }
    .chat-column {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      min-width: 0;
      min-height: 0;
      background:
        radial-gradient(ellipse 70% 40% at 50% -5%, #cfe4dc 0%, transparent 60%),
        linear-gradient(180deg, #eef2ee 0%, #e4ebe5 100%);
    }
    .chat-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1.15rem;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
      background: color-mix(in srgb, #f7faf7 88%, transparent);
      backdrop-filter: blur(8px);
    }
    .chat-top h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .chat-sub {
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .sidebar-toggle {
      display: none;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      padding: 0.35rem 0.65rem;
      border: 1px solid var(--line);
      border-radius: 0.55rem;
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
    }
    .info-banner {
      margin: 0.75rem 1.15rem 0;
      padding: 0.65rem 0.8rem;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 0.75rem;
      font-size: 0.82rem;
    }
    .chat-log {
      overflow-y: auto;
      padding: 1rem 1.15rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      scroll-behavior: smooth;
    }
    .chat-empty {
      margin: auto;
      max-width: 22rem;
      text-align: center;
      color: var(--muted);
      font-size: 0.95rem;
      padding: 2rem 1rem;
    }
    .chat-row {
      display: flex;
      width: 100%;
      animation: rise 180ms ease-out;
    }
    .chat-row.user { justify-content: flex-end; }
    .chat-row.assistant, .chat-row.error { justify-content: flex-start; }
    .chat-bubble {
      max-width: min(42rem, 88%);
      padding: 0.75rem 0.95rem;
      border-radius: var(--radius);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.95rem;
      line-height: 1.5;
      box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
    }
    .chat-bubble h2, .chat-bubble h3, .chat-bubble h4 {
      margin: 0.85rem 0 0.45rem;
      font-weight: 600;
    }
    .chat-bubble h2:first-child, .chat-bubble h3:first-child, .chat-bubble h4:first-child {
      margin-top: 0;
    }
    .chat-bubble h2 { font-size: 1.15rem; }
    .chat-bubble h3 { font-size: 1.05rem; }
    .chat-bubble h4 { font-size: 0.98rem; }
    .chat-bubble p {
      margin: 0.45rem 0;
    }
    .chat-bubble p:first-child {
      margin-top: 0;
    }
    .chat-bubble p:last-child {
      margin-bottom: 0;
    }
    .chat-bubble code {
      font-family: var(--mono);
      font-size: 0.85em;
      background: color-mix(in srgb, var(--ink) 8%, transparent);
      padding: 0.12rem 0.3rem;
      border-radius: 0.25rem;
    }
    .chat-bubble pre {
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      padding: 0.65rem 0.75rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin: 0.65rem 0;
    }
    .chat-bubble pre code {
      background: none;
      padding: 0;
    }
    .chat-bubble ul, .chat-bubble ol {
      margin: 0.45rem 0;
      padding-left: 1.5rem;
    }
    .chat-bubble li {
      margin: 0.25rem 0;
    }
    .chat-bubble table {
      border-collapse: collapse;
      margin: 0.65rem 0;
      width: 100%;
      font-size: 0.9em;
    }
    .chat-bubble th, .chat-bubble td {
      border: 1px solid var(--line);
      padding: 0.35rem 0.5rem;
      text-align: left;
    }
    .chat-bubble th {
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      font-weight: 600;
    }
    .chat-bubble a {
      color: var(--accent);
      text-decoration: underline;
    }
    .chat-bubble strong {
      font-weight: 600;
    }
    .chat-bubble em {
      font-style: italic;
    }
    .chat-bubble.user {
      background: var(--user-bubble);
      color: var(--user-ink);
      border-bottom-right-radius: 0.35rem;
    }
    .chat-bubble.assistant {
      background: var(--assistant-bubble);
      color: var(--ink);
      border: 1px solid var(--line);
      border-bottom-left-radius: 0.35rem;
    }
    .chat-bubble.assistant.streaming::after {
      content: "";
      display: inline-block;
      width: 0.45rem;
      height: 1em;
      margin-left: 0.15rem;
      vertical-align: text-bottom;
      background: var(--accent);
      animation: blink 1s steps(1) infinite;
    }
    .chat-bubble.error {
      background: var(--danger-soft);
      color: #6b2a22;
      border: 1px solid color-mix(in srgb, #6b2a22 25%, var(--line));
      border-bottom-left-radius: 0.35rem;
    }
    .composer {
      padding: 0.65rem 1.15rem 1rem;
      background: linear-gradient(180deg, transparent, color-mix(in srgb, #eef2ee 90%, transparent) 28%);
    }
    .composer-shell {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.55rem;
      align-items: end;
      padding: 0.55rem 0.55rem 0.55rem 0.85rem;
      border: 1px solid var(--line);
      border-radius: 1.25rem;
      background: var(--surface);
      box-shadow:
        0 10px 30px color-mix(in srgb, var(--ink) 6%, transparent),
        0 1px 0 color-mix(in srgb, #fff 70%, transparent) inset;
    }
    .composer textarea {
      font: inherit;
      font-size: 0.98rem;
      border: none;
      outline: none;
      resize: none;
      max-height: 9rem;
      background: transparent;
      color: var(--ink);
      padding: 0.45rem 0;
      line-height: 1.45;
    }
    .composer button {
      font: inherit;
      font-weight: 600;
      padding: 0.55rem 1rem;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
    }
    .composer button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .composer-hint {
      margin: 0.45rem 0 0;
      text-align: center;
      font-size: 0.72rem;
      color: var(--muted);
      font-family: var(--mono);
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        width: min(22rem, 88vw);
        z-index: 20;
        transform: translateX(-105%);
        transition: transform 180ms ease;
        box-shadow: 8px 0 30px color-mix(in srgb, var(--ink) 18%, transparent);
      }
      body.sidebar-open .sidebar { transform: translateX(0); }
      .sidebar-toggle { display: inline-flex; }
    }
  `;
}

function chatClientScript(): string {
  // Keep as a plain string for inline <script>; escape carefully for template.
  return `(function () {
  var TOKEN_KEY = 'dashboardToken';
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var log = document.getElementById('chat-log');
  var empty = document.getElementById('chat-empty');
  var sendBtn = document.getElementById('chat-send');
  var toggle = document.getElementById('sidebar-toggle');
  if (!form || !input || !log || !sendBtn) return;

  var currentContext = null;
  var currentThreadId = localStorage.getItem('currentThreadId') || null;

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function showUnlockModal(isRetry) {
    var existingModal = document.getElementById('unlock-modal');
    if (existingModal) return;
    
    var overlay = document.createElement('div');
    overlay.id = 'unlock-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999;animation:fadeIn 200ms ease;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);padding:1.5rem;border-radius:1rem;max-width:24rem;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 250ms ease;';
    
    var title = document.createElement('h2');
    title.textContent = isRetry ? 'Token incorrecto' : 'Dashboard protegido';
    title.style.cssText = 'margin:0 0 0.5rem;font-size:1.2rem;color:var(--ink);';
    
    var desc = document.createElement('p');
    desc.textContent = isRetry ? 'El token ingresado no es válido. Por favor verifica e intenta de nuevo.' : 'Ingresa el token de autenticación desde tu archivo .env para acceder al chat.';
    desc.style.cssText = 'margin:0 0 1rem;color:var(--muted);font-size:0.9rem;line-height:1.5;';
    
    var inputField = document.createElement('input');
    inputField.type = 'password';
    inputField.placeholder = 'DASHBOARD_TOKEN';
    inputField.style.cssText = 'width:100%;padding:0.65rem 0.85rem;font:inherit;font-size:0.95rem;border:1px solid var(--line);border-radius:0.6rem;margin-bottom:1rem;background:var(--panel);';
    
    var btn = document.createElement('button');
    btn.textContent = 'Desbloquear';
    btn.style.cssText = 'width:100%;padding:0.65rem;font:inherit;font-weight:600;border:none;border-radius:0.6rem;background:var(--accent);color:#fff;cursor:pointer;';
    
    var error = document.createElement('p');
    error.style.cssText = 'margin:0.75rem 0 0;color:#c53030;font-size:0.85rem;display:none;';
    
    btn.addEventListener('click', function () {
      var token = inputField.value.trim();
      if (!token) {
        error.textContent = 'El token no puede estar vacío';
        error.style.display = 'block';
        return;
      }
      setToken(token);
      document.body.removeChild(overlay);
      if (isRetry) {
        location.reload();
      }
    });
    
    inputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });
    
    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(inputField);
    modal.appendChild(btn);
    modal.appendChild(error);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    inputField.focus();
  }

  function fetchWithToken(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    var token = getToken();
    if (token) {
      options.headers['X-Dashboard-Token'] = token;
    }
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        clearToken();
        showUnlockModal(true);
        throw new Error('Unauthorized');
      }
      return res;
    });
  }

  if (!getToken()) {
    showUnlockModal(false);
  }

  document.querySelectorAll('.side-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var panel = tab.getAttribute('data-panel');
      document.querySelectorAll('.side-tab').forEach(function (el) {
        el.classList.toggle('is-active', el === tab);
      });
      document.querySelectorAll('.side-panel').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-panel') === panel);
      });
    });
  });

  document.querySelectorAll('.turn-header').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      var turnId = btn.getAttribute('data-turn-id');
      var turnItem = btn.closest('.turn-item');
      
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        var details = document.querySelector('.turn-details[data-turn-id="' + turnId + '"]');
        var isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        if (details) {
          details.hidden = isExpanded;
        }
        return;
      }
      
      if (turnItem) {
        var turnPrompt = turnItem.getAttribute('data-turn-prompt');
        var turnReply = turnItem.getAttribute('data-turn-reply');
        if (turnPrompt) {
          hideEmpty();
          log.innerHTML = '';
          currentContext = { userPrompt: turnPrompt, assistantReply: turnReply || '' };
          appendBubble('user', turnPrompt, false);
          if (turnReply) {
            fetchWithToken('/api/markdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: turnReply })
            }).then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            }).then(function (data) {
              appendBubble('assistant', data.markdown || turnReply, true);
            }).catch(function () {
              appendBubble('assistant', turnReply, false);
            });
          } else {
            var noReplyEl = appendBubble('assistant', 'sin respuesta guardada', false);
            noReplyEl.style.fontStyle = 'italic';
            noReplyEl.style.color = 'var(--muted)';
          }
        }
      }
    });
  });

  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('sidebar-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function hideEmpty() {
    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
  }

  function appendBubble(role, text, isMarkdown) {
    hideEmpty();
    var row = document.createElement('div');
    row.className = 'chat-row ' + role;
    var el = document.createElement('div');
    el.className = 'chat-bubble ' + role;
    if (isMarkdown && role === 'assistant') {
      el.innerHTML = text;
    } else {
      el.textContent = text;
    }
    row.appendChild(el);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 144) + 'px';
  }
  input.addEventListener('input', autosize);

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var prompt = (input.value || '').trim();
    if (!prompt) return;
    input.value = '';
    autosize();
    appendBubble('user', prompt);
    var assistantEl = appendBubble('assistant', '');
    assistantEl.classList.add('streaming');
    sendBtn.disabled = true;
    input.disabled = true;

    var body = { prompt: prompt };
    if (currentThreadId) {
      body.threadId = currentThreadId;
    } else if (currentContext) {
      body.context = currentContext;
    }

    fetchWithToken('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error((body && body.message) || ('HTTP ' + res.status));
        }).catch(function (err) {
          if (err instanceof Error && err.message.indexOf('HTTP') === 0) throw err;
          throw new Error('HTTP ' + res.status);
        });
      }
      if (!res.body) throw new Error('No response body');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });
          var parts = buffer.split('\\n\\n');
          buffer = parts.pop() || '';
          for (var i = 0; i < parts.length; i++) {
            var block = parts[i];
            var lines = block.split('\\n');
            for (var j = 0; j < lines.length; j++) {
              var line = lines[j];
              if (line.indexOf('data: ') !== 0) continue;
              var payload;
              try { payload = JSON.parse(line.slice(6)); } catch (e) { continue; }
              if (payload.type === 'delta' && typeof payload.text === 'string') {
                assistantEl.setAttribute('data-raw', (assistantEl.getAttribute('data-raw') || '') + payload.text);
                assistantEl.textContent = assistantEl.getAttribute('data-raw') || '';
                log.scrollTop = log.scrollHeight;
              } else if (payload.type === 'error' && typeof payload.message === 'string') {
                assistantEl.className = 'chat-bubble error';
                assistantEl.textContent = payload.message;
                currentContext = null;
              } else if (payload.type === 'done' && typeof payload.reply === 'string') {
                var finalText = payload.reply;
                if (payload.markdown && typeof payload.markdown === 'string') {
                  assistantEl.innerHTML = payload.markdown;
                } else {
                  assistantEl.textContent = finalText;
                }
                
                if (payload.requiresForceConfirmation === true) {
                  var actions = document.createElement('div');
                  actions.className = 'confirm-actions';
                  
                  var okBtn = document.createElement('button');
                  okBtn.className = 'confirm-btn ok';
                  okBtn.textContent = 'Confirmar';
                  
                  var noBtn = document.createElement('button');
                  noBtn.className = 'confirm-btn no';
                  noBtn.textContent = 'Cancelar';
                  
                  function handleConfirm(action) {
                    okBtn.disabled = true;
                    noBtn.disabled = true;
                    
                    var newAssistantEl = appendBubble('assistant', '');
                    newAssistantEl.classList.add('streaming');
                    sendBtn.disabled = true;
                    input.disabled = true;
                    
                    fetchWithToken('/api/confirm', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                      body: JSON.stringify({ action: action })
                    }).then(function (res) {
                      if (!res.ok) throw new Error('HTTP ' + res.status);
                      if (!res.body) throw new Error('No response body');
                      var reader = res.body.getReader();
                      var decoder = new TextDecoder();
                      var buffer = '';
                      function pumpConfirm() {
                        return reader.read().then(function (result) {
                          if (result.done) return;
                          buffer += decoder.decode(result.value, { stream: true });
                          var parts = buffer.split('\\n\\n');
                          buffer = parts.pop() || '';
                          for (var i = 0; i < parts.length; i++) {
                            var block = parts[i];
                            var lines = block.split('\\n');
                            for (var j = 0; j < lines.length; j++) {
                              var line = lines[j];
                              if (line.indexOf('data: ') !== 0) continue;
                              var payload;
                              try { payload = JSON.parse(line.slice(6)); } catch (e) { continue; }
                              if (payload.type === 'delta' && typeof payload.text === 'string') {
                                newAssistantEl.setAttribute('data-raw', (newAssistantEl.getAttribute('data-raw') || '') + payload.text);
                                newAssistantEl.textContent = newAssistantEl.getAttribute('data-raw') || '';
                                log.scrollTop = log.scrollHeight;
                              } else if (payload.type === 'error' && typeof payload.message === 'string') {
                                newAssistantEl.className = 'chat-bubble error';
                                newAssistantEl.textContent = payload.message;
                              } else if (payload.type === 'done') {
                                if (payload.markdown && typeof payload.markdown === 'string') {
                                  newAssistantEl.innerHTML = payload.markdown;
                                } else if (typeof payload.reply === 'string') {
                                  newAssistantEl.textContent = payload.reply;
                                }
                              }
                            }
                          }
                          return pumpConfirm();
                        });
                      }
                      return pumpConfirm();
                    }).catch(function (err) {
                      newAssistantEl.classList.remove('streaming');
                      newAssistantEl.className = 'chat-bubble error';
                      newAssistantEl.textContent = err && err.message ? err.message : String(err);
                    }).then(function () {
                      newAssistantEl.classList.remove('streaming');
                      sendBtn.disabled = false;
                      input.disabled = false;
                      input.focus();
                    });
                  }
                  
                  okBtn.addEventListener('click', function () { handleConfirm('ok'); });
                  noBtn.addEventListener('click', function () { handleConfirm('no'); });
                  
                  actions.appendChild(okBtn);
                  actions.appendChild(noBtn);
                  assistantEl.parentNode.appendChild(actions);
                }
                
                if (payload.threadId) {
                  currentThreadId = payload.threadId;
                  localStorage.setItem('currentThreadId', currentThreadId);
                  loadThreads();
                } else {
                  currentContext = { userPrompt: prompt, assistantReply: finalText };
                }
              }
            }
          }
          return pump();
        }).catch(function () {
          throw new Error('Stream ended without done or error');
        });
      }
      return pump();
    }).catch(function (err) {
      assistantEl.classList.remove('streaming');
      assistantEl.className = 'chat-bubble error';
      assistantEl.textContent = err && err.message ? err.message : String(err);
      currentContext = null;
    }).then(function () {
      assistantEl.classList.remove('streaming');
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    });
  });

  function loadThreads() {
    fetchWithToken('/api/threads')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var panel = document.getElementById('threads-list-panel');
        if (!panel) return;
        if (!data.threads || data.threads.length === 0) {
          panel.innerHTML = '<p style="padding:8px;color:var(--muted);font-size:0.9em;">Sin hilos todavía</p>';
          return;
        }
        var html = '<div class="thread-list">';
        data.threads.forEach(function (t) {
          var active = currentThreadId === t.id ? ' is-active' : '';
          var title = t.title || 'Sin título';
          if (title.length > 50) title = title.slice(0, 47) + '...';
          html += '<button class="thread-item' + active + '" data-thread-id="' + t.id + '">' +
                  '<div class="thread-title">' + title + '</div>' +
                  '<div class="thread-meta">' + new Date(t.updatedAt).toLocaleString() + '</div>' +
                  '</button>';
        });
        html += '</div>';
        panel.innerHTML = html;
        
        panel.querySelectorAll('.thread-item').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var threadId = btn.getAttribute('data-thread-id');
            loadThread(threadId);
          });
        });
      })
      .catch(function (err) {
        console.error('Failed to load threads:', err);
      });
  }

  function loadThread(threadId) {
    fetchWithToken('/api/threads/' + threadId)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.thread) return;
        currentThreadId = threadId;
        localStorage.setItem('currentThreadId', threadId);
        currentContext = null;
        log.innerHTML = '';
        hideEmpty();
        
        data.thread.messages.forEach(function (msg) {
          if (msg.role === 'assistant') {
            fetchWithToken('/api/markdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: msg.content })
            }).then(function (res) { return res.json(); })
              .then(function (mdData) {
                appendBubble('assistant', mdData.markdown || msg.content, true);
              })
              .catch(function () {
                appendBubble('assistant', msg.content, false);
              });
          } else {
            appendBubble('user', msg.content, false);
          }
        });
        
        loadThreads();
      })
      .catch(function (err) {
        console.error('Failed to load thread:', err);
      });
  }

  var newThreadBtn = document.getElementById('new-thread-btn');
  if (newThreadBtn) {
    newThreadBtn.addEventListener('click', function () {
      currentThreadId = null;
      currentContext = null;
      localStorage.removeItem('currentThreadId');
      log.innerHTML = '';
      if (empty && !empty.parentNode) {
        log.appendChild(empty);
      }
      loadThreads();
      input.focus();
    });
  }

  loadThreads();
})();`;
}

function observeClientScript(): string {
  return `(function () {
  document.querySelectorAll('.turn-header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var turnId = btn.getAttribute('data-turn-id');
      var details = document.querySelector('.turn-details[data-turn-id="' + turnId + '"]');
      var isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      if (details) {
        details.hidden = isExpanded;
      }
    });
  });
})();`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
