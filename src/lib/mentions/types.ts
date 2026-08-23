export interface ResolvedMention {
  readonly kind: 'file' | 'directory';
  readonly originalMention: string;
  readonly resolvedPath: string;
  readonly content?: string;
  readonly truncated?: boolean;
  readonly error?: string;
}

export interface ParsedMentions {
  readonly mentions: readonly ResolvedMention[];
  readonly cleanedPrompt: string;
}

export interface SlashCommand {
  readonly command: string;
  readonly skillName?: string;
  readonly isBuiltIn: boolean;
  readonly args: string;
}
