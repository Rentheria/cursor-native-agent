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
      --danger: #6b2a22;
      --danger-soft: #f3d9d4;
      --modal-overlay: rgba(21, 32, 28, 0.65);
      --modal-shadow: rgba(21, 32, 28, 0.3);
      --error-text: #c53030;
      --button-text: #ffffff;
      --mono: "IBM Plex Mono", "ui-monospace", "Cascadia Code", monospace;
      --sans: "IBM Plex Sans", "Segoe UI", sans-serif;
      --sidebar-w: 22rem;
      --radius: 1.1rem;
    }
    html[data-theme="dark"] {
      color-scheme: dark;
      --ink: #e8f0ec;
      --muted: #8ea099;
      --line: #364842;
      --panel: #1a2420;
      --paper: #0f1612;
      --surface: #1f2b26;
      --accent: #1eb39f;
      --accent-soft: #0d3d35;
      --user-bubble: #1eb39f;
      --user-ink: #0a1b17;
      --assistant-bubble: #1f2b26;
      --warn: #d18c3e;
      --warn-soft: #3d2f1a;
      --danger: #e07369;
      --danger-soft: #3d1f1c;
      --modal-overlay: rgba(0, 0, 0, 0.75);
      --modal-shadow: rgba(0, 0, 0, 0.6);
      --error-text: #f38b82;
      --button-text: #0a1b17;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
        --ink: #e8f0ec;
        --muted: #8ea099;
        --line: #364842;
        --panel: #1a2420;
        --paper: #0f1612;
        --surface: #1f2b26;
        --accent: #1eb39f;
        --accent-soft: #0d3d35;
        --user-bubble: #1eb39f;
        --user-ink: #0a1b17;
        --assistant-bubble: #1f2b26;
        --warn: #d18c3e;
        --warn-soft: #3d2f1a;
        --danger: #e07369;
        --danger-soft: #3d1f1c;
        --modal-overlay: rgba(0, 0, 0, 0.75);
        --modal-shadow: rgba(0, 0, 0, 0.6);
        --error-text: #f38b82;
        --button-text: #0a1b17;
      }
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
    .panel-hint {
      font-size: 0.8rem;
      color: var(--muted);
      margin: 0 0 0.75rem;
      line-height: 1.4;
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
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.35rem 0.65rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      transition: all 120ms ease;
    }
    .theme-toggle:hover {
      background: var(--panel);
      color: var(--ink);
      border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    }
    .theme-toggle-icon {
      font-size: 0.95em;
      opacity: 0.8;
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

/**
 * Styles specific to chat (interactive) mode.
 * Includes modal, sidebar, chat bubbles, thread list, and delete button styles.
 */
export function chatStyles(): string {
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
      color: var(--button-text);
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
      color: var(--button-text);
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
    .side-tab:first-child {
      grid-column: 1 / 2;
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
      padding: 0.55rem 0.75rem;
      border-radius: var(--radius);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.95rem;
      line-height: 1.5;
      box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
    }
    .chat-bubble h2, .chat-bubble h3, .chat-bubble h4 {
      margin: 0.5rem 0 0.3rem;
      font-weight: 600;
    }
    .chat-bubble h2:first-child, .chat-bubble h3:first-child, .chat-bubble h4:first-child {
      margin-top: 0;
    }
    .chat-bubble h2 { font-size: 1.15rem; }
    .chat-bubble h3 { font-size: 1.05rem; }
    .chat-bubble h4 { font-size: 0.98rem; }
    .chat-bubble p {
      margin: 0.3rem 0;
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
      padding: 0.45rem 0.55rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin: 0.4rem 0;
    }
    .chat-bubble pre code {
      background: none;
      padding: 0;
    }
    .chat-bubble ul, .chat-bubble ol {
      margin: 0.3rem 0;
      padding-left: 1.5rem;
    }
    .chat-bubble li {
      margin: 0.15rem 0;
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
      white-space: normal;
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
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--line));
      border-bottom-left-radius: 0.35rem;
      white-space: normal;
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
      color: var(--button-text);
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
    .button {
      font: inherit;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.5rem 1rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      width: 100%;
      margin-bottom: 0.75rem;
    }
    .button:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    .button-new-thread {
      font: inherit;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 0.45rem 0.85rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      white-space: nowrap;
      transition: all 120ms ease;
    }
    .button-new-thread:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    .thread-list {
      display: grid;
      gap: 0.35rem;
    }
    .thread-item {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid var(--line);
      border-radius: 0.55rem;
      background: var(--surface);
      cursor: pointer;
      text-align: left;
      font: inherit;
      transition: background 120ms ease;
    }
    .thread-item:hover {
      background: var(--accent-soft);
    }
    .thread-item.is-active {
      background: var(--accent-soft);
      border-color: var(--accent);
    }
    .thread-content {
      min-width: 0;
    }
    .thread-title {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--ink);
      margin: 0 0 0.15rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .thread-meta {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--muted);
    }
    .thread-actions {
      display: flex;
      gap: 0.35rem;
      flex-shrink: 0;
    }
    .thread-rename-btn {
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--line);
      border-radius: 0.45rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.8rem;
      line-height: 1;
      transition: all 120ms ease;
      flex-shrink: 0;
    }
    .thread-rename-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    .thread-delete-btn {
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--line);
      border-radius: 0.45rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.8rem;
      line-height: 1;
      transition: all 120ms ease;
      flex-shrink: 0;
    }
    .thread-delete-btn:hover {
      background: var(--danger-soft);
      border-color: #c53030;
      color: #c53030;
    }
    .thread-actions {
      display: flex;
      gap: 0.25rem;
    }
    .thread-rename-btn {
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--line);
      border-radius: 0.45rem;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.8rem;
      line-height: 1;
      transition: all 120ms ease;
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
