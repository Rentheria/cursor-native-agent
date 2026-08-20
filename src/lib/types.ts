export interface SkillDocument {
  readonly name: string;
  readonly description: string;
  readonly triggers: readonly string[];
  readonly body: string;
  readonly filePath: string;
}

export interface MemoryDetailDocument {
  readonly name: string;
  readonly description: string;
  readonly memoryType: string;
  readonly body: string;
  readonly filePath: string;
  readonly relativeLink: string;
}

export interface MemoryIndexEntry {
  readonly title: string;
  readonly relativePath: string;
  readonly hook: string;
  readonly line: string;
}

export interface MemoryLoadResult {
  readonly indexMarkdown: string;
  readonly indexEntries: readonly MemoryIndexEntry[];
  readonly details: readonly MemoryDetailDocument[];
}

export interface AssembledPrompt {
  readonly finalPrompt: string;
  readonly matchedSkills: readonly SkillDocument[];
  readonly memory: MemoryLoadResult;
}
