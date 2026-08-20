import type {
  AssembledPrompt,
  MemoryLoadResult,
  SkillDocument,
} from '../lib/types.js';

export function assemblePrompt(params: {
  readonly userPrompt: string;
  readonly matchedSkills: readonly SkillDocument[];
  readonly memory: MemoryLoadResult;
}): AssembledPrompt {
  const { userPrompt, matchedSkills, memory } = params;
  const sections: string[] = [
    '# Orchestrated context for cursor-agent',
    '',
    'You are running as the Cursor-native agent brain. Follow any injected skill',
    'instructions. Use memory only as background context; prefer the user request.',
    '',
    'When building projects or apps, scaffold them in the `workspace/` directory (not',
    'the wrapper repo root). That directory is gitignored and is the designated space',
    'for user-requested code.',
    '',
  ];

  sections.push('## Memory index (always loaded)');
  sections.push('');
  sections.push(memory.indexMarkdown);
  sections.push('');

  if (memory.details.length > 0) {
    sections.push('## Relevant memory details');
    sections.push('');
    for (const detail of memory.details) {
      sections.push(`### ${detail.name} (${detail.relativeLink})`);
      sections.push('');
      sections.push(detail.body);
      sections.push('');
    }
  } else {
    sections.push('## Relevant memory details');
    sections.push('');
    sections.push('_No memory detail files matched this prompt; index only._');
    sections.push('');
  }

  if (matchedSkills.length > 0) {
    sections.push('## Active skills');
    sections.push('');
    for (const skill of matchedSkills) {
      sections.push(`### Skill: ${skill.name}`);
      sections.push('');
      sections.push(`Trigger/description: ${skill.description}`);
      sections.push('');
      sections.push(skill.body);
      sections.push('');
    }
  } else {
    sections.push('## Active skills');
    sections.push('');
    sections.push('_No skills matched this prompt._');
    sections.push('');
  }

  sections.push('## User request');
  sections.push('');
  sections.push(userPrompt);

  return {
    finalPrompt: sections.join('\n'),
    matchedSkills,
    memory,
  };
}
