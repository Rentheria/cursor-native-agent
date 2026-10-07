import { stripTaskCommand } from './intent.js';

export const PANAL_AGENTS = ['cursor', 'agy', 'claude', 'auto'] as const;
export type PanalAgent = (typeof PANAL_AGENTS)[number];
export type PanalMode = 'read-only' | 'write';

export interface LaunchProposal {
  readonly agent: PanalAgent;
  readonly model?: string;
  readonly mode: PanalMode;
  readonly timeoutMin: number;
  readonly dir: string;
  readonly task: string;
}

export interface ProposeLaunchInput {
  readonly prompt: string;
  readonly dir: string;
  readonly defaultTimeoutMin?: number;
}

const PROPOSAL_BLOCK =
  /<<<PANAL_PROPOSAL\s*([\s\S]*?)PANAL_PROPOSAL>>>/i;

export function isPanalAgent(value: string): value is PanalAgent {
  return (PANAL_AGENTS as readonly string[]).includes(value);
}

export function parsePanalProposalBlock(text: string): LaunchProposal | undefined {
  const match = text.match(PROPOSAL_BLOCK);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const fields = parseFieldBlock(match[1]);
  const agentRaw = (fields['agent'] ?? 'auto').trim().toLowerCase();
  const { agent, model } = parseAgentChain(agentRaw);
  const modeRaw = (fields['mode'] ?? 'read-only').trim().toLowerCase();
  const mode: PanalMode = modeRaw === 'write' ? 'write' : 'read-only';
  const timeoutMin = parseTimeoutMinutes(fields['timeout'] ?? fields['timeoutmin']);
  const dir = fields['dir']?.trim();
  const task = fields['task']?.trim();
  if (dir === undefined || dir === '' || task === undefined || task === '') {
    return undefined;
  }
  return {
    agent,
    ...(model !== undefined ? { model } : {}),
    mode,
    timeoutMin: timeoutMin ?? 15,
    dir,
    task,
  };
}

export function proposeLaunch(input: ProposeLaunchInput): LaunchProposal {
  const fromBlock = parsePanalProposalBlock(input.prompt);
  if (fromBlock !== undefined) {
    return fromBlock;
  }

  const text = stripTaskCommand(input.prompt);
  const { agent, model } = detectAgent(text);
  const mode = detectMode(text);
  const timeoutMin =
    parseTimeoutMinutes(text) ?? input.defaultTimeoutMin ?? 15;
  const task = stripMetaFromTask(text);

  return {
    agent,
    ...(model !== undefined ? { model } : {}),
    mode,
    timeoutMin,
    dir: input.dir,
    task: task === '' ? text : task,
  };
}

export function formatLaunchProposal(proposal: LaunchProposal): string {
  const chain =
    proposal.agent === 'cursor' && proposal.model !== undefined
      ? `cursor:${proposal.model}`
      : proposal.agent;
  const writeNote =
    proposal.mode === 'write'
      ? 'write (non-main branch/worktree only)'
      : 'read-only';
  return [
    'I can launch this as a coding-agent task. Nothing runs until you confirm.',
    '',
    `- **Agent:** ${chain}`,
    `- **Mode:** ${writeNote}`,
    `- **Timeout:** ${String(proposal.timeoutMin)} min`,
    `- **Directory:** \`${proposal.dir}\``,
    `- **Task:** ${proposal.task}`,
    '',
    'Reply **Confirmar** / `/ok` to launch, or **Cancelar** / `/no` to abort.',
    'You can refine first, e.g. `use claude, write, 30 min`.',
  ].join('\n');
}

export function parseAgentChain(raw: string): { agent: PanalAgent; model?: string } {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith('cursor:')) {
    const model = raw.trim().slice('cursor:'.length).trim();
    return { agent: 'cursor', ...(model !== '' ? { model } : {}) };
  }
  if (isPanalAgent(trimmed)) {
    return { agent: trimmed };
  }
  return { agent: 'auto' };
}

function detectAgent(text: string): { agent: PanalAgent; model?: string } {
  const cursorModel = text.match(/\bcursor:([A-Za-z0-9._-]+)/i);
  if (cursorModel?.[1] !== undefined) {
    return { agent: 'cursor', model: cursorModel[1] };
  }
  if (/\bclaude\b/i.test(text)) {
    return { agent: 'claude' };
  }
  if (/\bagy\b/i.test(text)) {
    return { agent: 'agy' };
  }
  if (/\bcursor\b/i.test(text)) {
    return { agent: 'cursor' };
  }
  if (/\bauto\b/i.test(text)) {
    return { agent: 'auto' };
  }
  return { agent: 'auto' };
}

function detectMode(text: string): PanalMode {
  if (/\b(?:write|escribir|modifica|implementa|--force|--write)\b/i.test(text)) {
    return 'write';
  }
  if (/\b(?:read-?only|solo\s+lectura|revis[ae]|review|explica|explain)\b/i.test(text)) {
    return 'read-only';
  }
  return 'read-only';
}

export function parseTimeoutMinutes(text: string | undefined): number | undefined {
  if (text === undefined) {
    return undefined;
  }
  const match = text.match(/\b(\d+)\s*(?:m|min|mins|minutes?|minutos?)\b/i);
  if (match?.[1] === undefined) {
    const bare = text.trim();
    if (/^\d+$/.test(bare)) {
      const n = Number.parseInt(bare, 10);
      return n > 0 ? n : undefined;
    }
    return undefined;
  }
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function stripMetaFromTask(text: string): string {
  return text
    .replace(/\b(?:use|usa|usando|with)\s+(?:cursor(?::[A-Za-z0-9._-]+)?|agy|claude|auto)\b/gi, '')
    .replace(/\b(?:read-?only|solo\s+lectura|write|escribir|--force|--write)\b/gi, '')
    .replace(/\b\d+\s*(?:m|min|mins|minutes?|minutos?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseFieldBlock(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key !== '') {
      fields[key] = value;
    }
  }
  return fields;
}
