import type {
  AssembledPrompt,
  MemoryLoadResult,
  SkillDocument,
} from '../lib/types.js';
import type { PreparedAttachment } from '../lib/attachments/index.js';

export function assemblePrompt(params: {
  readonly userPrompt: string;
  readonly matchedSkills: readonly SkillDocument[];
  readonly memory: MemoryLoadResult;
  readonly workspacePath?: string;
  readonly repoRoot?: string;
  readonly attachments?: readonly PreparedAttachment[];
}): AssembledPrompt {
  const { userPrompt, matchedSkills, memory, workspacePath, repoRoot, attachments } = params;
  
  const sections: string[] = [
    '# Orchestrated context for cursor-agent',
    '',
    'You are running as the Cursor-native agent brain. Follow any injected skill',
    'instructions. Use memory only as background context; prefer the user request.',
    '',
  ];

  if (workspacePath !== undefined) {
    sections.push(`**Build workspace (WORKSPACE_PATH):** \`${workspacePath}\``);
    sections.push(`**Repo root:** \`${repoRoot ?? '(not provided)'}\``);
    sections.push('');
    sections.push('When the user asks for "workspace path" / "path de trabajo" / "directorio de trabajo",');
    sections.push(`answer with the build workspace path above (\`${workspacePath}\`), NOT the repo root.`);
    sections.push('Do NOT invent paths like Documents or home directories.');
    sections.push('');
    sections.push('When building projects or apps, scaffold them in the build workspace directory');
    sections.push('(not the wrapper repo root). That directory is gitignored and is the');
    sections.push('designated space for user-requested code.');
    sections.push('');
  } else {
    sections.push('When building projects or apps, scaffold them in the `workspace/` directory (not');
    sections.push('the wrapper repo root). That directory is gitignored and is the designated space');
    sections.push('for user-requested code.');
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

  if (attachments !== undefined && attachments.length > 0) {
    sections.push('## Attached files');
    sections.push('');
    sections.push(`The user has attached ${String(attachments.length)} file(s). Process them according to the request.`);
    sections.push('');
    for (const attachment of attachments) {
      sections.push(`### Attachment: ${attachment.originalPath}`);
      sections.push('');
      if (attachment.kind === 'pdf') {
        sections.push('Type: PDF (converted to markdown with MarkItDown)');
        sections.push('');
        if (attachment.text !== undefined) {
          sections.push(attachment.text);
        }
        if (attachment.truncated === true) {
          sections.push('');
          sections.push('_Note: PDF content was truncated due to size._');
        }
      } else if (attachment.kind === 'image') {
        sections.push(`Type: Image (${attachment.originalPath})`);
        sections.push('');
        sections.push(`Image path: \`${attachment.imagePath ?? attachment.originalPath}\``);
        sections.push('');
        sections.push('_Note: Image files are passed through. Use appropriate tools to process them._');
      } else if (attachment.kind === 'text') {
        sections.push('Type: Text file');
        sections.push('');
        if (attachment.text !== undefined) {
          sections.push('```');
          sections.push(attachment.text);
          sections.push('```');
        }
        if (attachment.truncated === true) {
          sections.push('');
          sections.push('_Note: Text file was truncated due to size._');
        }
      } else if (attachment.kind === 'binary-skipped') {
        sections.push('Type: Binary file (skipped)');
        sections.push('');
        sections.push(attachment.text ?? `[Binary file: ${attachment.originalPath}]`);
      }
      sections.push('');
    }
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
