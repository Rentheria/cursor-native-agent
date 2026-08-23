import type { SlashCommand } from './types.js';
import type { SkillDocument } from '../types.js';

const BUILT_IN_COMMANDS = new Set(['help', 'clear']);

export function parseSlashCommand(
  prompt: string,
  availableSkills: readonly SkillDocument[],
): SlashCommand | undefined {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }

  const spaceIndex = trimmed.indexOf(' ');
  const commandPart =
    spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex);
  const args = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

  if (commandPart === '') {
    return undefined;
  }

  const isBuiltIn = BUILT_IN_COMMANDS.has(commandPart);
  if (isBuiltIn) {
    return {
      command: commandPart,
      isBuiltIn: true,
      args,
    };
  }

  const matchedSkill = availableSkills.find(
    (skill) =>
      skill.name === commandPart || skill.name.replace(/-/g, '') === commandPart,
  );

  if (matchedSkill !== undefined) {
    return {
      command: commandPart,
      skillName: matchedSkill.name,
      isBuiltIn: false,
      args,
    };
  }

  return undefined;
}

export function buildHelpMessage(skills: readonly SkillDocument[]): string {
  const lines = [
    '# Available Commands',
    '',
    '## Built-in Commands',
    '',
    '- `/help` — Show this help message',
    '- `/clear` — Clear thread history (if threads are enabled)',
    '',
    '## Skills (via slash commands)',
    '',
  ];

  for (const skill of skills) {
    lines.push(`- \`/${skill.name}\` — ${skill.description}`);
  }

  lines.push('');
  lines.push('## @ Mentions');
  lines.push('');
  lines.push('- `@path/to/file.ts` — Include file content in context');
  lines.push('- `@folder/` — List directory contents');
  lines.push('');

  return lines.join('\n');
}
