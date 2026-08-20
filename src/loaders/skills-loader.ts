import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_SEMANTIC_THRESHOLD,
  DEFAULT_SEMANTIC_TOP_K,
  SEMANTIC_SKILLS_ENV,
  SEMANTIC_THRESHOLD_ENV,
  SEMANTIC_TOP_K_ENV,
  SKILLS_DIRECTORY_NAME,
} from '../lib/constants.js';
import { resolveSemanticRanker } from '../lib/embeddings/resolve-provider.js';
import type { SemanticRanker } from '../lib/embeddings/types.js';
import {
  parseTriggerList,
  readMarkdownWithFrontmatter,
  requireStringAttribute,
} from './frontmatter.js';
import { promptMatchesKeywords } from './keyword-match.js';
import type { SkillDocument } from '../lib/types.js';

export async function loadAllSkills(repoRoot: string): Promise<readonly SkillDocument[]> {
  const skillsDir = path.join(repoRoot, SKILLS_DIRECTORY_NAME);
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(skillsDir, entry.name))
    .toSorted();

  const skills: SkillDocument[] = [];
  for (const filePath of markdownFiles) {
    skills.push(await loadSkillFile(filePath));
  }
  return skills;
}

export interface SemanticSkillOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly ranker?: SemanticRanker;
  readonly topK?: number;
  readonly threshold?: number;
  readonly enabled?: boolean;
}

export interface SemanticSkillHit {
  readonly skill: SkillDocument;
  readonly score: number;
}

/**
 * Selects relevant skills, first by exact trigger match, then by semantic
 * fallback (local TF-IDF) when no exact matches exist.
 */
export async function selectRelevantSkills(
  prompt: string,
  skills: readonly SkillDocument[],
  options: SemanticSkillOptions = {},
): Promise<readonly SkillDocument[]> {
  const exactMatches = skills.filter((skill) =>
    promptMatchesKeywords(prompt, skill.triggers),
  );

  if (exactMatches.length > 0) {
    console.error(
      `[skills] matched ${exactMatches.length} skill(s) via exact triggers: ${exactMatches.map((s) => s.name).join(', ')}`,
    );
    return exactMatches;
  }

  const env = options.env ?? process.env;
  const enabled = options.enabled ?? isSemanticSkillsEnabled(env);
  if (!enabled || skills.length === 0 || prompt.trim() === '') {
    console.error('[skills] no exact trigger match and semantic fallback disabled');
    return [];
  }

  const semanticHits = await selectSemanticSkills(prompt, skills, options);
  if (semanticHits.length > 0) {
    console.error(
      `[skills] matched ${semanticHits.length} skill(s) via semantic fallback: ${semanticHits.map((h) => `${h.skill.name}(${h.score.toFixed(3)})`).join(', ')}`,
    );
    return semanticHits.map((hit) => hit.skill);
  }

  console.error('[skills] no exact or semantic matches found');
  return [];
}

function isSemanticSkillsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env[SEMANTIC_SKILLS_ENV];
  if (flag === undefined || flag.trim() === '') {
    return true;
  }
  const normalized = flag.trim().toLowerCase();
  return (
    normalized !== '0' &&
    normalized !== 'false' &&
    normalized !== 'no' &&
    normalized !== 'off'
  );
}

function readSemanticTopK(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env[SEMANTIC_TOP_K_ENV], DEFAULT_SEMANTIC_TOP_K);
}

function readSemanticThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[SEMANTIC_THRESHOLD_ENV]?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_SEMANTIC_THRESHOLD;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_SEMANTIC_THRESHOLD;
  }
  return value;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return value;
}

/**
 * Builds searchable text for a skill (name + description + triggers + body).
 */
function buildSkillSearchText(skill: SkillDocument): string {
  return [skill.name, skill.description, ...skill.triggers, skill.body].join('\n');
}

/**
 * Ranks skills by semantic similarity and returns top hits above threshold.
 */
async function selectSemanticSkills(
  prompt: string,
  skills: readonly SkillDocument[],
  options: SemanticSkillOptions = {},
): Promise<readonly SemanticSkillHit[]> {
  const env = options.env ?? process.env;
  const topK = options.topK ?? readSemanticTopK(env);
  const threshold = options.threshold ?? readSemanticThreshold(env);
  const ranker = options.ranker ?? (await resolveSemanticRanker(env));

  const documents = skills.map((skill) => buildSkillSearchText(skill));
  const scores = await ranker.rank(prompt, documents);

  const hits: SemanticSkillHit[] = [];
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const score = scores[i] ?? 0;
    if (skill === undefined || score < threshold) {
      continue;
    }
    hits.push({ skill, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

async function loadSkillFile(filePath: string): Promise<SkillDocument> {
  const { attributes, body } = await readMarkdownWithFrontmatter(filePath);
  const name = requireStringAttribute(attributes, 'name', filePath);
  const description = requireStringAttribute(attributes, 'description', filePath);
  const triggers = parseTriggerList(attributes['triggers']);
  if (triggers.length === 0) {
    throw new Error(
      `Missing required frontmatter "triggers" in ${filePath} (comma-separated whole-word phrases)`,
    );
  }

  return {
    name,
    description,
    triggers,
    body,
    filePath,
  };
}
