/**
 * Canned stage-pitch for live Meetup demos.
 * Deterministic 30-second pitch (no model call) when stage-pitch skill matches.
 */

/**
 * Detects if the user prompt is in Spanish based on common Spanish triggers.
 */
export function isSpanishPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const spanishTriggers = [
    'qué hace',
    'qué es',
    'explica',
    'resumen',
    'en escena',
    'proyecto',
  ];
  return spanishTriggers.some((trigger) => normalized.includes(trigger));
}

/**
 * Returns a canned 30-second pitch in Spanish.
 * Three beats: Hook / Proof / Close. ≤12 non-empty lines.
 */
function getCannedPitchSpanish(): string {
  return [
    '**Hook:** Agente autónomo construido 100% sobre Cursor CLI — skills cargables + memoria markdown + orquestación multi-agente.',
    '',
    '**Proof (tres piezas en vivo):**',
    '- Skill trigger: `npm run agent -- "qué hace este repo"` dispara `stage-pitch`',
    '- Memoria lazy: `MEMORY.md` siempre cargado, detalles por keyword o semántica local (TF-IDF)',
    '- Cron tick: `npm run cron` chequea salud del repo (git + índice), reporta con `cursor-agent --mode ask`',
    '- Worker dispatch: `"delega esto a otro agente: resume MEMORY.md"` → 2º `cursor-agent` headless',
    '',
    '**Close:** Repo público — fork el patrón, cambia las skills/memoria, y tu agente corre en tu cuenta de Cursor.',
    '',
  ].join('\n');
}

/**
 * Returns a canned 30-second pitch in English.
 * Three beats: Hook / Proof / Close. ≤12 non-empty lines.
 */
function getCannedPitchEnglish(): string {
  return [
    '**Hook:** Autonomous agent built 100% on Cursor CLI — loadable skills + markdown memory + multi-agent orchestration.',
    '',
    '**Proof (three pieces live):**',
    '- Skill trigger: `npm run agent -- "what does this repo do"` fires `stage-pitch`',
    '- Lazy memory: `MEMORY.md` always loaded, details by keyword or local semantic (TF-IDF)',
    '- Cron tick: `npm run cron` checks repo health (git + index), reports with `cursor-agent --mode ask`',
    '- Worker dispatch: `"delegate this to another agent: summarize MEMORY.md"` → 2nd headless `cursor-agent`',
    '',
    '**Close:** Public repo — fork the pattern, change skills/memory, and your agent runs on your Cursor account.',
    '',
  ].join('\n');
}

/**
 * Returns a canned stage pitch based on the user's prompt language.
 * Spanish triggers like "qué hace este repo" return Spanish pitch; otherwise English.
 */
export function getCannedPitch(userPrompt: string): string {
  if (isSpanishPrompt(userPrompt)) {
    return getCannedPitchSpanish();
  }
  return getCannedPitchEnglish();
}
