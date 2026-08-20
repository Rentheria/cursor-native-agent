/**
 * Canonical phrases that always dispatch a headless sub-agent.
 * Kept intentionally narrow so live demos never miss (or false-fire) delegation.
 *
 * 1. "pídele a otro agente que <subtask>"
 * 2. "delega esto a <target>: <subtask>"  (also accepts -, — or – as separator)
 */

const ASK_OTHER_AGENT_PREFIX = /pídele a otro agente que\b/i;
const DELEGATE_THIS_TO_PREFIX = /delega esto a\b/i;

/**
 * Colon and typographic dashes may sit tight against the words; a plain ASCII
 * hyphen must be surrounded by spaces so it cannot steal the one in
 * "sub-agente" (the target people actually type).
 */
const DELEGATE_SEPARATOR = String.raw`(?:\s*:\s*|\s*[—–]\s*|\s+-\s+)`;

/**
 * Detects whether the user prompt asks the orchestrator to dispatch a
 * headless sub-agent (second `cursor-agent` process).
 */
export function hasDelegationIntent(prompt: string): boolean {
  return (
    ASK_OTHER_AGENT_PREFIX.test(prompt) || DELEGATE_THIS_TO_PREFIX.test(prompt)
  );
}

/**
 * Extracts the subtask text from a canonical delegation phrase.
 * Returns an empty string when framing is present but the subtask is missing.
 */
export function extractDelegationSubtask(prompt: string): string {
  const ask = prompt.match(/pídele a otro agente que\s+(.+)/i);
  if (ask?.[1] !== undefined && ask[1].trim() !== '') {
    return ask[1].trim();
  }

  const delega = prompt.match(
    new RegExp(String.raw`delega esto a\s+.+?${DELEGATE_SEPARATOR}(.+)`, 'i'),
  );
  if (delega?.[1] !== undefined && delega[1].trim() !== '') {
    return delega[1].trim();
  }

  return '';
}
