import type {
  AgentTurnSummary,
  MemoryIndexEntry,
  ParsedCronFinding,
} from './parse-logs.js';
import { fontFaces, sharedStyles, observeStyles, chatStyles } from './styles.js';
import { renderObserveShell, renderChatShell, escapeHtml as escapeHtmlInternal } from './shells.js';

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
  return escapeHtmlInternal(text);
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

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
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
      <p class="source">${escapeHtml(snapshot.sources.agentPath)} · más recientes ${String(snapshot.agentTurns.length)}</p>
      <p class="panel-hint">Historial de ejecuciones del agente (log). Haz clic para ver detalles.</p>
      ${
        snapshot.agentTurns.length === 0
          ? '<p class="empty">Sin turnos todavía. Envía un mensaje en el chat o ejecuta <span class="mono">npm run agent -- "tu prompt"</span>.</p>'
          : `<div class="turns-list">${agentRows}</div>`
      }
    </section>`;

  const cronSection = `
    <section class="panel" aria-labelledby="cron-heading">
      <h2 id="cron-heading">Hallazgos de cron</h2>
      <p class="source">${escapeHtml(snapshot.sources.cronPath)} · más recientes ${String(snapshot.cronFindings.length)}</p>
      <div class="findings">
        ${
          snapshot.cronFindings.length === 0
            ? '<p class="empty">Sin hallazgos todavía. Ejecuta <span class="mono">npm run cron</span> o <span class="mono">npm run cron:install</span> para habilitar el cron autónomo.</p>'
            : cronCards
        }
      </div>
    </section>`;

  const memorySection = `
    <section class="panel" aria-labelledby="memory-heading">
      <h2 id="memory-heading">MEMORY.md index</h2>
      <p class="source">${escapeHtml(snapshot.sources.memoryPath)} · ${String(snapshot.memoryEntries.length)} entrada${snapshot.memoryEntries.length === 1 ? '' : 's'}</p>
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
  <title>cursor-native-agent — ${chatEnabled ? 'chat' : 'observar'}</title>
  <script>
    (function() {
      var stored = localStorage.getItem('dashboard-theme');
      var theme = stored || 'system';
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>
  <style>
${fontFaces()}
${sharedStyles()}
${chatEnabled ? chatStyles() : observeStyles()}
  </style>
</head>
${body}
</html>`;
}
