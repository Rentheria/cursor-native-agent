const LAUNCH_PATTERNS = [
  /\bpanal\s+delegate\b/i,
  /\b\/(?:task|panal)\b/i,
  /\blanza(?:r)?\s+(?:un\s+)?(?:agente|task|tarea)\b/i,
  /\bdeleg(?:a|á|ate)\s+(?:esto|esta\s+tarea|this|the\s+task)\s+a\s+(?:cursor|agy|claude|auto|panal)\b/i,
  /\b(?:launch|run|start)\s+(?:a\s+)?(?:coding\s+)?(?:agent|task)\b/i,
  /\bask\s+(?:cursor|agy|claude|auto)\s+to\b/i,
  /\bpídele\s+a\s+(?:cursor|agy|claude|auto)\b/i,
  /\bhand\s+(?:this|the\s+task)\s+to\b/i,
];

const STATUS_PATTERNS = [
  /\b\/panal-status\b/i,
  /\bpanal\s+(?:status|list|history|dashboard)\b/i,
  /\b(?:status|estado)\s+(?:de\s+)?(?:las?\s+)?(?:panal|runs?|tareas?)\b/i,
  /\b(?:how(?:'s| is)|qué\s+tal)\s+(?:my\s+)?(?:panal|run)\b/i,
];

const CONFIRM_COMMANDS = new Set(['/ok', '/confirm', 'ok', 'yes', 'y', 'sí', 'si', 'confirm']);
const CANCEL_COMMANDS = new Set(['/no', '/cancel', 'no', 'n', 'cancel']);

export function isPanalLaunchIntent(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.startsWith('/task') || trimmed.startsWith('/panal')) {
    const cmd = trimmed.split(/\s+/, 1)[0];
    return cmd === '/task' || cmd === '/panal';
  }
  return LAUNCH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isPanalStatusIntent(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed === '/panal-status' || trimmed.startsWith('/panal-status ')) {
    return true;
  }
  return STATUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isConfirmCommand(prompt: string): boolean {
  return CONFIRM_COMMANDS.has(prompt.trim().toLowerCase());
}

export function isCancelCommand(prompt: string): boolean {
  return CANCEL_COMMANDS.has(prompt.trim().toLowerCase());
}

export function stripTaskCommand(prompt: string): string {
  return prompt.replace(/^\s*\/(?:task|panal)\s+/i, '').trim();
}
