/**
 * CSS style builders for the dashboard.
 * Each function returns a CSS string to be inlined in <style> tags.
 */

/**
 * @font-face declarations for self-hosted IBM Plex Sans and Mono.
 * Offline-first: no Google Fonts CDN, only local /fonts/*.woff2 files.
 */
export function fontFaces(): string {
  return `
    @font-face {
      font-family: "IBM Plex Sans";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url(/fonts/ibm-plex-sans-latin-400-normal.woff2) format("woff2");
    }
    @font-face {
      font-family: "IBM Plex Sans";
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: url(/fonts/ibm-plex-sans-latin-500-normal.woff2) format("woff2");
    }
    @font-face {
      font-family: "IBM Plex Sans";
      font-style: normal;
      font-weight: 600;
      font-display: swap;
      src: url(/fonts/ibm-plex-sans-latin-600-normal.woff2) format("woff2");
    }
    @font-face {
      font-family: "IBM Plex Mono";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url(/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2");
    }
    @font-face {
      font-family: "IBM Plex Mono";
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: url(/fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2");
    }
  `;
}

/**
 * Core shared styles: CSS variables, resets, common components.
 * Used by both observe and chat modes.
 * Includes dark mode support via data-theme attribute and prefers-color-scheme.
 */
export function sharedStyles(): string {
  return `
    :root {
      color-scheme: light;
      --ink: #141410;
      --muted: #6b6b66;
      --line: #e6e5e0;
      --panel: #f7f5f0;
      --paper: #f7f5f0;
      --surface: #ffffff;
      --accent: #141410;
      --accent-soft: #e6e5e0;
      --accent-hover: #2a2a25;
      --user-bubble: #141410;
      --user-ink: #f7f5f0;
      --assistant-bubble: #ffffff;
      --warn: #d97706;
      --warn-soft: #fef3c7;
      --danger: #dc2626;
      --danger-soft: #fee2e2;
      --modal-overlay: rgba(20, 20, 16, 0.7);
      --modal-shadow: rgba(20, 20, 16, 0.25);
      --error-text: #dc2626;
      --button-text: #f7f5f0;
      --mono: "IBM Plex Mono", "ui-monospace", "Cascadia Code", monospace;
      --sans: "IBM Plex Sans", "Segoe UI", sans-serif;
      --sidebar-w: 20rem;
      --radius: 0.85rem;
      --radius-lg: 1.25rem;
      --shadow-sm: 0 1px 2px 0 rgba(20, 20, 16, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(20, 20, 16, 0.1), 0 2px 4px -1px rgba(20, 20, 16, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(20, 20, 16, 0.1), 0 4px 6px -2px rgba(20, 20, 16, 0.05);
      --shadow-xl: 0 20px 25px -5px rgba(20, 20, 16, 0.1), 0 10px 10px -5px rgba(20, 20, 16, 0.04);
      --glow: #e6e5e0;
      --paper-mid: #faf9f6;
    }
    html[data-theme="dark"] {
      color-scheme: dark;
      --ink: #f7f5f0;
      --muted: #9a9a92;
      --line: #2a2a25;
      --panel: #1a1a18;
      --paper: #141410;
      --surface: #1f1f1c;
      --accent: #f7f5f0;
      --accent-soft: #2a2a25;
      --accent-hover: #ffffff;
      --user-bubble: #f7f5f0;
      --user-ink: #141410;
      --assistant-bubble: #1f1f1c;
      --warn: #fbbf24;
      --warn-soft: #3d2f1a;
      --danger: #f87171;
      --danger-soft: #3d1f1c;
      --modal-overlay: rgba(0, 0, 0, 0.8);
      --modal-shadow: rgba(0, 0, 0, 0.7);
      --error-text: #f87171;
      --button-text: #141410;
      --glow: #2a2a25;
      --paper-mid: #1a1a18;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
        --ink: #f7f5f0;
        --muted: #9a9a92;
        --line: #2a2a25;
        --panel: #1a1a18;
        --paper: #141410;
        --surface: #1f1f1c;
        --accent: #f7f5f0;
        --accent-soft: #2a2a25;
        --accent-hover: #ffffff;
        --user-bubble: #f7f5f0;
        --user-ink: #141410;
        --assistant-bubble: #1f1f1c;
        --warn: #fbbf24;
        --warn-soft: #3d2f1a;
        --danger: #f87171;
        --danger-soft: #3d1f1c;
        --modal-overlay: rgba(0, 0, 0, 0.8);
        --modal-shadow: rgba(0, 0, 0, 0.7);
        --error-text: #f87171;
        --button-text: #141410;
        --glow: #2a2a25;
        --paper-mid: #1a1a18;
      }
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--ink);
      background: var(--paper);
      line-height: 1.5;
      font-size: 15px;
    }
    .mono { 
      font-family: var(--mono); 
      font-size: 0.85em;
      letter-spacing: -0.01em;
    }
    .empty, .empty-row {
      color: var(--muted);
      font-style: italic;
      padding: 0.75rem 0;
      font-size: 0.95rem;
    }
    .source {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
      margin: -0.25rem 0 1rem;
      letter-spacing: -0.01em;
    }
    .panel h2 {
      margin: 0 0 0.85rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
      font-weight: 600;
    }
    .panel-hint {
      font-size: 0.88rem;
      color: var(--muted);
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th, td {
      text-align: left;
      padding: 0.5rem 0.55rem;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-family: var(--mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
    }
    td.prompt { word-break: break-word; }
    .turns-list {
      display: grid;
      gap: 0.65rem;
    }
    .turn-item {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      transition: box-shadow 150ms ease;
    }
    .turn-item:hover {
      box-shadow: var(--shadow-md);
    }
    .turn-header {
      width: 100%;
      text-align: left;
      padding: 0.85rem 1rem;
      border: none;
      background: transparent;
      cursor: pointer;
      font: inherit;
      color: inherit;
      display: grid;
      gap: 0.45rem;
      transition: background 150ms ease;
    }
    .turn-header:hover {
      background: color-mix(in srgb, var(--accent) 3%, transparent);
    }
    .turn-header[aria-expanded="true"] {
      background: var(--accent-soft);
      border-bottom: 1px solid var(--line);
    }
    .turn-header-main {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .turn-time {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    .turn-badge {
      font-family: var(--mono);
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
      font-weight: 500;
    }
    .turn-prompt-preview {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .turn-details {
      padding: 1rem;
      background: color-mix(in srgb, var(--panel) 50%, transparent);
      border-top: 1px solid var(--line);
      display: grid;
      gap: 0.85rem;
    }
    .turn-details[hidden] {
      display: none;
    }
    .turn-detail-section {
      display: grid;
      gap: 0.35rem;
    }
    .turn-detail-label {
      font-family: var(--mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
      margin: 0;
    }
    .turn-detail-value {
      margin: 0;
      font-size: 0.92rem;
      line-height: 1.6;
      word-break: break-word;
    }
    .turn-prompt-full {
      white-space: pre-wrap;
      font-size: 0.95rem;
    }
    .findings { display: grid; gap: 0.85rem; }
    .finding {
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 0.85rem 1rem;
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
    }
    .finding header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.65rem;
    }
    .finding dl {
      margin: 0;
      display: grid;
      gap: 0.3rem 1rem;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      font-size: 0.9rem;
    }
    .finding dt {
      font-family: var(--mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
    }
    .finding dd { margin: 0.12rem 0 0; }
    .finding .note { grid-column: 1 / -1; }
    .badge {
      font-family: var(--mono);
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 999px;
      font-weight: 500;
    }
    .verdict-ready {
      background: var(--accent-soft);
      border-color: color-mix(in srgb, var(--accent) 30%, transparent);
      color: var(--accent);
    }
    .verdict-dirty {
      background: var(--warn-soft);
      border-color: color-mix(in srgb, var(--warn) 30%, transparent);
      color: var(--warn);
    }
    .memory-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.7rem;
    }
    .memory-list li {
      display: grid;
      gap: 0.2rem;
      padding: 0.7rem 0.85rem;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
    }
    .memory-list .path { 
      color: var(--muted); 
      font-size: 0.8rem;
      letter-spacing: -0.01em;
    }
    .memory-list .keywords { font-size: 0.9rem; }
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      padding: 0.45rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      transition: all 150ms ease;
      box-shadow: var(--shadow-sm);
    }
    .theme-toggle:hover {
      background: var(--panel);
      color: var(--ink);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
      box-shadow: var(--shadow-md);
    }
    .theme-toggle-icon {
      font-size: 1em;
      opacity: 0.85;
    }
  `;
}

/**
 * Styles specific to observe (read-only) mode.
 */
export function observeStyles(): string {
  return `
    body.mode-observe {
      background:
        radial-gradient(ellipse 80% 50% at 15% -10%, var(--glow) 0%, transparent 55%),
        linear-gradient(180deg, var(--paper) 0%, var(--paper-mid) 40%, var(--paper) 100%);
      min-height: 100vh;
    }
    header.top {
      padding: 2rem clamp(1.25rem, 4vw, 3rem) 1.25rem;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface) 85%, transparent);
      backdrop-filter: blur(8px);
    }
    header.top h1 {
      margin: 0;
      font-size: clamp(1.5rem, 2.5vw, 1.95rem);
      font-weight: 600;
      letter-spacing: -0.025em;
      line-height: 1.2;
    }
    header.top p {
      margin: 0.5rem 0 0;
      color: var(--muted);
      max-width: 48rem;
      font-size: 1rem;
      line-height: 1.6;
    }
    .meta {
      margin-top: 1rem;
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--muted);
      letter-spacing: -0.01em;
    }
    .observe-main {
      padding: 1.5rem clamp(1.25rem, 4vw, 3rem) 4rem;
      display: grid;
      gap: 2rem;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 1.25rem 1.4rem 1.5rem;
      box-shadow: var(--shadow-sm);
    }
    footer {
      padding: 0 0 2.5rem;
      text-align: center;
      font-size: 0.82rem;
      color: var(--muted);
      font-family: var(--mono);
      letter-spacing: -0.01em;
    }
  `;
}

/**
 * Styles specific to chat (interactive) mode.
 * Includes modal, sidebar, chat bubbles, thread list, and delete button styles.
 */
export function chatStyles(): string {
  return `
    .unlock-modal {
      position: fixed;
      inset: 0;
      background: var(--modal-overlay);
      backdrop-filter: blur(6px);
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
      border-radius: var(--radius-lg);
      padding: 1.75rem 2rem;
      max-width: 30rem;
      box-shadow: var(--shadow-xl);
    }
    .unlock-card h2 {
      margin: 0 0 0.85rem;
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--ink);
      letter-spacing: -0.02em;
    }
    .unlock-card p {
      margin: 0 0 0.75rem;
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--ink);
    }
    .unlock-card code {
      font-family: var(--mono);
      font-size: 0.88em;
      background: var(--panel);
      padding: 0.2rem 0.4rem;
      border-radius: 0.35rem;
    }
    .unlock-card input {
      width: 100%;
      padding: 0.75rem 0.85rem;
      font: inherit;
      font-size: 0.98rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      margin: 0.85rem 0 0.75rem;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .unlock-card input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .unlock-card button {
      width: 100%;
      padding: 0.75rem;
      font: inherit;
      font-weight: 600;
      font-size: 0.98rem;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: var(--button-text);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .unlock-card button:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }
    .unlock-hint {
      margin-top: 0.75rem !important;
      font-size: 0.85rem !important;
      color: var(--muted) !important;
    }
    .confirm-actions {
      display: flex;
      gap: 0.65rem;
      margin-top: 0.75rem;
    }
    .confirm-btn {
      font: inherit;
      font-weight: 600;
      font-size: 0.92rem;
      padding: 0.6rem 1.1rem;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .confirm-btn.ok {
      background: var(--accent);
      color: var(--button-text);
    }
    .confirm-btn.ok:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .confirm-btn.no {
      background: var(--line);
      color: var(--ink);
    }
    .confirm-btn.no:hover {
      background: var(--panel);
    }
    .confirm-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    body.mode-chat {
      overflow: hidden;
      background:
        radial-gradient(ellipse 70% 45% at 20% -8%, var(--glow) 0%, transparent 58%),
        linear-gradient(165deg, var(--paper) 0%, var(--paper-mid) 45%, var(--paper) 100%);
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
      background: color-mix(in srgb, var(--panel) 90%, transparent);
      min-height: 0;
    }
    .sidebar-brand {
      padding: 1.25rem 1.15rem 1rem;
      display: grid;
      gap: 0.3rem;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface) 60%, transparent);
    }
    .sidebar-brand strong {
      font-size: 1.05rem;
      letter-spacing: -0.025em;
      font-weight: 600;
      color: var(--ink);
    }
    .sidebar-brand .meta {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: -0.01em;
    }
    html[data-theme="dark"] .sidebar-brand img {
      filter: brightness(1.4) contrast(0.9);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .sidebar-brand img {
        filter: brightness(1.4) contrast(0.9);
      }
    }
    .sidebar-nav {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.4rem;
      padding: 0.85rem;
      border-bottom: 1px solid var(--line);
    }
    .side-tab {
      font: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      padding: 0.5rem 0.4rem;
      border: 1px solid transparent;
      border-radius: 0.6rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .side-tab:hover {
      color: var(--ink);
      background: color-mix(in srgb, var(--surface) 50%, transparent);
    }
    .side-tab.is-active {
      background: var(--surface);
      border-color: var(--line);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }
    .side-tab:first-child {
      grid-column: 1 / 2;
    }
    .sidebar-panels {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 0.85rem;
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
        radial-gradient(ellipse 65% 35% at 50% -3%, var(--glow) 0%, transparent 65%),
        linear-gradient(180deg, var(--paper) 0%, var(--paper-mid) 100%);
    }
    .chat-top {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 1rem 1.4rem;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
      background: color-mix(in srgb, var(--surface) 75%, transparent);
      backdrop-filter: blur(10px);
    }
    .chat-top h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .chat-sub {
      margin: 0.2rem 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .sidebar-toggle {
      display: none;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .sidebar-toggle:hover {
      background: var(--panel);
      border-color: var(--accent);
    }
    .info-banner {
      margin: 0;
      padding: 0.65rem 1.4rem;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
      background: color-mix(in srgb, var(--panel) 40%, transparent);
      color: var(--muted);
      font-size: 0.8rem;
      line-height: 1.5;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .info-banner .mono {
      color: var(--ink);
      font-weight: 500;
    }
    .chat-log {
      overflow-y: auto;
      padding: 1.25rem 1.4rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      scroll-behavior: smooth;
    }
    .chat-empty {
      margin: auto;
      max-width: 26rem;
      text-align: center;
      color: var(--muted);
      padding: 3rem 1.5rem;
      position: relative;
    }
    .chat-empty::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 120px;
      height: 120px;
      background-image: url('/static/favicon.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      opacity: 0.04;
      pointer-events: none;
      z-index: -1;
    }
    html[data-theme="dark"] .chat-empty::before {
      background-image: url('/static/cursor-mark-light.png');
      opacity: 0.08;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .chat-empty::before {
        background-image: url('/static/cursor-mark-light.png');
        opacity: 0.08;
      }
    }
    .chat-empty > p:first-child {
      font-size: 1.05rem;
      font-weight: 500;
      color: var(--ink);
      margin: 0 0 1.25rem;
    }
    .chat-empty-hint {
      font-size: 0.88rem;
      line-height: 1.65;
      text-align: left;
      margin: 0;
    }
    .chat-empty-hint strong {
      color: var(--ink);
      font-weight: 600;
      display: block;
      margin-top: 0.85rem;
    }
    .chat-empty-hint strong:first-child {
      margin-top: 0;
    }
    .chat-empty-hint code {
      font-family: var(--mono);
      font-size: 0.9em;
      background: var(--panel);
      padding: 0.15rem 0.35rem;
      border-radius: 0.3rem;
      color: var(--ink);
    }
    .chat-row {
      display: flex;
      width: 100%;
      animation: rise 200ms ease-out;
    }
    .chat-row.user { justify-content: flex-end; }
    .chat-row.assistant, .chat-row.error { justify-content: flex-start; }
    .chat-bubble {
      max-width: min(45rem, 85%);
      padding: 0.7rem 0.95rem;
      border-radius: var(--radius-lg);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.98rem;
      line-height: 1.6;
    }
    .chat-bubble h2, .chat-bubble h3, .chat-bubble h4 {
      margin: 0.75rem 0 0.4rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .chat-bubble h2:first-child, .chat-bubble h3:first-child, .chat-bubble h4:first-child {
      margin-top: 0;
    }
    .chat-bubble h2 { font-size: 1.25rem; }
    .chat-bubble h3 { font-size: 1.1rem; }
    .chat-bubble h4 { font-size: 1rem; }
    .chat-bubble p {
      margin: 0.4rem 0;
    }
    .chat-bubble p:first-child {
      margin-top: 0;
    }
    .chat-bubble p:last-child {
      margin-bottom: 0;
    }
    .chat-bubble code {
      font-family: var(--mono);
      font-size: 0.88em;
      background: color-mix(in srgb, var(--ink) 7%, transparent);
      padding: 0.15rem 0.35rem;
      border-radius: 0.3rem;
    }
    .chat-bubble pre {
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius);
      overflow-x: auto;
      margin: 0.6rem 0;
      border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
    }
    .chat-bubble pre code {
      background: none;
      padding: 0;
    }
    .chat-bubble ul, .chat-bubble ol {
      margin: 0.4rem 0;
      padding-left: 1.65rem;
    }
    .chat-bubble li {
      margin: 0.2rem 0;
    }
    .chat-bubble table {
      border-collapse: collapse;
      margin: 0.75rem 0;
      width: 100%;
      font-size: 0.92em;
    }
    .chat-bubble th, .chat-bubble td {
      border: 1px solid var(--line);
      padding: 0.4rem 0.6rem;
      text-align: left;
    }
    .chat-bubble th {
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      font-weight: 600;
    }
    .chat-bubble a {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }
    .chat-bubble a:hover {
      color: var(--accent-hover);
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
      border-bottom-right-radius: 0.45rem;
      box-shadow: var(--shadow-md);
    }
    .chat-bubble.assistant {
      background: var(--assistant-bubble);
      color: var(--ink);
      border: 1px solid var(--line);
      border-bottom-left-radius: 0.45rem;
      white-space: normal;
      box-shadow: var(--shadow-sm);
    }
    .chat-bubble.assistant.streaming::after {
      content: "";
      display: inline-block;
      width: 0.5rem;
      height: 1em;
      margin-left: 0.2rem;
      vertical-align: text-bottom;
      background: var(--accent);
      animation: blink 1s steps(1) infinite;
    }
    .chat-bubble.error {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
      border-bottom-left-radius: 0.45rem;
      white-space: normal;
      box-shadow: var(--shadow-sm);
    }
    .composer {
      padding: 0.85rem 1.4rem 1.25rem;
      background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--surface) 80%, transparent) 35%);
    }
    .composer-shell {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.65rem;
      align-items: end;
      padding: 0.7rem 0.7rem 0.7rem 1rem;
      border: 1.5px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .composer-shell:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-lg);
    }
    .attach-btn {
      flex-shrink: 0;
      background: none;
      border: none;
      padding: 0.55rem;
      cursor: pointer;
      font-size: 1.3rem;
      line-height: 1;
      opacity: 0.65;
      transition: all 150ms ease;
      border-radius: 0.5rem;
    }
    .attach-btn:hover {
      opacity: 1;
      background: var(--panel);
    }
    .composer-attachments {
      padding: 0.6rem 0.9rem 0;
    }
    .attach-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .composer textarea {
      font: inherit;
      font-size: 1rem;
      border: none;
      outline: none;
      resize: none;
      max-height: 10rem;
      background: transparent;
      color: var(--ink);
      padding: 0.5rem 0;
      line-height: 1.5;
    }
    .composer button[type="submit"] {
      font: inherit;
      font-weight: 600;
      padding: 0.65rem 1.25rem;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: var(--button-text);
      cursor: pointer;
      transition: all 150ms ease;
      box-shadow: var(--shadow-sm);
    }
    .composer button[type="submit"]:hover:not(:disabled) {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }
    .composer button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .composer-hint {
      margin: 0.6rem 0 0;
      text-align: center;
      font-size: 0.78rem;
      color: var(--muted);
      font-family: var(--mono);
      line-height: 1.6;
      letter-spacing: -0.01em;
    }
    .hint-muted {
      opacity: 0.75;
      font-size: 0.92em;
    }
    .button {
      font: inherit;
      font-weight: 600;
      font-size: 0.92rem;
      padding: 0.6rem 1.1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      width: 100%;
      margin-bottom: 0.85rem;
      transition: all 150ms ease;
      box-shadow: var(--shadow-sm);
    }
    .button:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    .button-new-thread {
      font: inherit;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.5rem 0.95rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      white-space: nowrap;
      transition: all 150ms ease;
      box-shadow: var(--shadow-sm);
    }
    .button-new-thread:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    .thread-list {
      display: grid;
      gap: 0.5rem;
    }
    .thread-item {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0.55rem;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      cursor: pointer;
      text-align: left;
      font: inherit;
      transition: all 150ms ease;
      box-shadow: var(--shadow-sm);
    }
    .thread-item:hover {
      background: var(--accent-soft);
      border-color: color-mix(in srgb, var(--accent) 50%, transparent);
      transform: translateX(2px);
      box-shadow: var(--shadow-md);
    }
    .thread-item.is-active {
      background: var(--accent-soft);
      border-color: var(--accent);
      box-shadow: var(--shadow-md);
    }
    .thread-content {
      min-width: 0;
    }
    .thread-title {
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--ink);
      margin: 0 0 0.2rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .thread-meta {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: -0.01em;
    }
    .thread-actions {
      display: flex;
      gap: 0.3rem;
      flex-shrink: 0;
    }
    .thread-rename-btn {
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      transition: all 150ms ease;
      flex-shrink: 0;
    }
    .thread-rename-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    .thread-delete-btn {
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      transition: all 150ms ease;
      flex-shrink: 0;
    }
    .thread-delete-btn:hover {
      background: var(--danger-soft);
      border-color: var(--danger);
      color: var(--danger);
    }
    .thread-actions {
      display: flex;
      gap: 0.3rem;
    }
    .thread-rename-btn {
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      transition: all 150ms ease;
      flex-shrink: 0;
    }
    .thread-rename-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        width: min(20rem, 85vw);
        z-index: 20;
        transform: translateX(-105%);
        transition: transform 200ms ease;
        box-shadow: 12px 0 40px color-mix(in srgb, var(--ink) 20%, transparent);
      }
      body.sidebar-open .sidebar { transform: translateX(0); }
      .sidebar-toggle { display: inline-flex; }
    }
  `;
}
