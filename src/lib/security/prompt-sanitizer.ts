/**
 * Prompt injection defenses: sanitize and structure user content to prevent
 * manipulation of system instructions.
 */

export interface SanitizationResult {
  readonly sanitized: string;
  readonly warnings: readonly string[];
  readonly blocked: boolean;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|directives?|prompts?|commands?)/i,
  /ignore\s+all/i,
  /forget\s+(everything|all|previous|prior)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|directives?|prompts?)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /new\s+(instructions?|directive|prompt|system|role)/i,
  /act\s+as(\s+(if|though|a|an))?/i,
  /pretend\s+(you|to\s+be)/i,
  /simulate\s+(being|a|an)/i,
  /system:\s*$/im,
  /assistant:\s*$/im,
  /human:\s*$/im,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|endoftext\|>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<\/SYS>>/i,
];

const SENSITIVE_INSTRUCTIONS = [
  /```[\s\S]*system[\s\S]*```/i,
  /```[\s\S]*assistant[\s\S]*```/i,
  /role\s*[:=]\s*["']?(system|assistant)/i,
  /execute\s+(this|the\s+following)\s+(code|command|script)/i,
  /run\s+(this|the\s+following)\s+(code|command|script)/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
];

const MAX_PROMPT_LENGTH = 50_000;
const MAX_REPETITION_COUNT = 5;

export function sanitizePrompt(userPrompt: string): SanitizationResult {
  const warnings: string[] = [];
  let sanitized = userPrompt;
  let blocked = false;

  if (sanitized.length > MAX_PROMPT_LENGTH) {
    warnings.push(`prompt truncated from ${sanitized.length} to ${MAX_PROMPT_LENGTH} characters`);
    sanitized = sanitized.substring(0, MAX_PROMPT_LENGTH);
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      warnings.push(`detected potential injection pattern: ${pattern.source}`);
      blocked = true;
    }
  }

  for (const pattern of SENSITIVE_INSTRUCTIONS) {
    if (pattern.test(sanitized)) {
      warnings.push(`detected sensitive instruction pattern: ${pattern.source}`);
      blocked = true;
    }
  }

  const repetitionCheck = detectExcessiveRepetition(sanitized);
  if (repetitionCheck.detected) {
    warnings.push(`detected excessive repetition: "${repetitionCheck.sample}" repeated ${repetitionCheck.count} times`);
    blocked = true;
  }

  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  if (hasExcessiveWhitespace(sanitized)) {
    warnings.push('excessive whitespace detected and normalized');
    sanitized = normalizeWhitespace(sanitized);
  }

  return { sanitized, warnings, blocked };
}

export function structurePrompt(params: {
  readonly systemInstructions: string;
  readonly userContent: string;
  readonly context?: string;
}): string {
  const userContentSafe = params.userContent.replace(/\n{3,}/g, '\n\n');
  
  const parts: string[] = [];
  
  if (params.context !== undefined && params.context.trim() !== '') {
    parts.push('=== CONTEXT ===');
    parts.push(params.context.trim());
    parts.push('');
  }
  
  parts.push('=== SYSTEM INSTRUCTIONS ===');
  parts.push(params.systemInstructions.trim());
  parts.push('');
  parts.push('=== USER REQUEST ===');
  parts.push(userContentSafe.trim());
  
  return parts.join('\n');
}

function detectExcessiveRepetition(text: string): {
  detected: boolean;
  sample?: string;
  count?: number;
} {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const minWindowSize = 3;
  const maxWindowSize = 10;
  
  for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize++) {
    if (words.length < windowSize * 2) {
      continue;
    }
    
    for (let i = 0; i <= words.length - windowSize; i++) {
      const window = words.slice(i, i + windowSize).join(' ');
      let count = 1;
      
      for (let j = i + windowSize; j <= words.length - windowSize; j++) {
        const nextWindow = words.slice(j, j + windowSize).join(' ');
        if (nextWindow === window) {
          count++;
          j += windowSize - 1;
        }
      }
      
      if (count > MAX_REPETITION_COUNT) {
        return {
          detected: true,
          sample: window.substring(0, 50),
          count,
        };
      }
    }
  }
  
  return { detected: false };
}

function hasExcessiveWhitespace(text: string): boolean {
  const whitespaceRatio = (text.match(/\s/g) ?? []).length / text.length;
  return whitespaceRatio > 0.5;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateClientInput(input: unknown): { valid: boolean; reason?: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, reason: 'input must be an object' };
  }

  const obj = input as Record<string, unknown>;

  if ('budget' in obj || 'limit' in obj || 'cost' in obj) {
    return { valid: false, reason: 'client-supplied budget/limit/cost parameters are not allowed' };
  }

  return { valid: true };
}
