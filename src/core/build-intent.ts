/**
 * Detects build/create intent from user prompts without relying solely on
 * exact skill trigger words. Covers common Spanish/English patterns.
 */

const BUILD_PHRASE_PATTERNS = [
  // Spanish: "haz un/una X", "construye un/una X", "crea un/una X"
  /\bhaz\s+un[ao]?\s+\w+/i,
  /\bconstruye\s+un[ao]?\s+\w+/i,
  /\bcrea\s+un[ao]?\s+\w+/i,
  
  // English: "make a X", "build a/an X", "create a/an X"
  /\bmake\s+an?\s+\w+/i,
  /\bbuild\s+an?\s+\w+/i,
  /\bcreate\s+an?\s+\w+/i,
];

const ARTIFACT_KEYWORDS = [
  // Spanish
  'app', 'aplicación', 'aplicacion', 'programa', 'proyecto',
  'página', 'pagina', 'sitio', 'web', 'api', 'servidor',
  'calculadora', 'juego', 'herramienta', 'script', 'componente',
  'splitter', 'tracker', 'manager', 'viewer', 'editor',
  'dashboard', 'portal', 'interfaz', 'formulario',
  
  // English
  'application', 'project', 'page', 'website', 'site',
  'server', 'calculator', 'game', 'tool', 'component',
  'tracker', 'manager', 'viewer', 'editor', 'dashboard',
  'portal', 'interface', 'form', 'cli', 'gui',
];

const NON_BUILD_KEYWORDS = [
  'commit', 'summary', 'summarize', 'resume', 'resumen',
  'pitch', 'explica', 'explain', 'describe', 'qué hace',
  'what does', 'how does', 'por qué', 'why',
];

/**
 * Returns true if the prompt looks like a build/create request (app, page,
 * tool, etc.) based on phrase patterns or artifact keywords.
 * 
 * Avoids false positives like "haz un commit" or "make a summary".
 */
export function isBuildIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  
  // Quick reject: known non-build commands
  for (const keyword of NON_BUILD_KEYWORDS) {
    if (lower.includes(keyword)) {
      return false;
    }
  }
  
  // Check phrase patterns (e.g. "haz una calculadora")
  for (const pattern of BUILD_PHRASE_PATTERNS) {
    if (pattern.test(lower)) {
      // Double-check it's not a non-build phrase
      for (const nonBuild of NON_BUILD_KEYWORDS) {
        if (lower.includes(nonBuild)) {
          return false;
        }
      }
      return true;
    }
  }
  
  // Check artifact keywords (e.g. "splitter de gastos")
  for (const artifact of ARTIFACT_KEYWORDS) {
    if (lower.includes(artifact)) {
      return true;
    }
  }
  
  return false;
}
