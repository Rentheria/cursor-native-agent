import type {
  AssembledPrompt,
  MemoryLoadResult,
  SkillDocument,
} from '../lib/types.js';

export function assemblePrompt(params: {
  readonly userPrompt: string;
  readonly matchedSkills: readonly SkillDocument[];
  readonly memory: MemoryLoadResult;
  readonly workspacePath?: string;
}): AssembledPrompt {
  const { userPrompt, matchedSkills, memory, workspacePath } = params;
  const hasStagePitch = matchedSkills.some((skill) => skill.name === 'stage-pitch');
  
  const sections: string[] = [
    '# Orchestrated context for cursor-agent',
    '',
    'You are running as the Cursor-native agent brain. Follow any injected skill',
    'instructions. Use memory only as background context; prefer the user request.',
    '',
  ];

  if (workspacePath !== undefined) {
    sections.push(`Current workspace path: \`${workspacePath}\``);
    sections.push('');
    sections.push('When building projects or apps, scaffold them in the workspace directory');
    sections.push('(not the wrapper repo root). That directory is gitignored and is the');
    sections.push('designated space for user-requested code.');
    sections.push('');
  } else {
    sections.push('When building projects or apps, scaffold them in the `workspace/` directory (not');
    sections.push('the wrapper repo root). That directory is gitignored and is the designated space');
    sections.push('for user-requested code.');
    sections.push('');
  }

  if (hasStagePitch) {
    sections.push('## CRITICAL OUTPUT CONSTRAINT (stage-pitch active)');
    sections.push('');
    sections.push('Your reply MUST be a 30-second stage pitch with EXACTLY three beats (≤12 lines total):');
    sections.push('1. **Hook** — one sentence: what problem this solves');
    sections.push('2. **Proof** — three concrete pieces the audience can see live');
    sections.push('3. **Close** — one sentence inviting them to try the repo');
    sections.push('');
    sections.push('Use spoken cadence, prefer bullets, no essay format. Match the user language');
    sections.push('(Spanish question → Spanish pitch, English → English). No invented features,');
    sections.push('no absolute home paths, no personal names.');
    sections.push('');
  }

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
