import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSlashCommand, buildHelpMessage } from './parse-slash-command.js';
import type { SkillDocument } from '../types.js';

const mockSkills: SkillDocument[] = [
  {
    name: 'git-commit',
    description: 'Draft commit messages',
    triggers: ['commit', 'git commit'],
    body: 'skill body',
    filePath: '/skills/git-commit.md',
  },
  {
    name: 'summarize-file',
    description: 'Summarize files',
    triggers: ['summarize', 'summary'],
    body: 'skill body',
    filePath: '/skills/summarize-file.md',
  },
];

describe('parseSlashCommand', () => {
  test('returns undefined for non-slash prompt', () => {
    const result = parseSlashCommand('hello world', mockSkills);
    assert.equal(result, undefined);
  });

  test('returns undefined for bare slash', () => {
    const result = parseSlashCommand('/', mockSkills);
    assert.equal(result, undefined);
  });

  test('parses built-in help command', () => {
    const result = parseSlashCommand('/help', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'help');
    assert.equal(result.isBuiltIn, true);
    assert.equal(result.args, '');
  });

  test('parses built-in clear command', () => {
    const result = parseSlashCommand('/clear', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'clear');
    assert.equal(result.isBuiltIn, true);
  });

  test('parses built-in threads command', () => {
    const result = parseSlashCommand('/threads', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'threads');
    assert.equal(result.isBuiltIn, true);
    assert.equal(result.args, '');
  });

  test('parses built-in attach command', () => {
    const result = parseSlashCommand('/attach file.txt', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'attach');
    assert.equal(result.isBuiltIn, true);
    assert.equal(result.args, 'file.txt');
  });

  test('parses built-in attach command with multiple files', () => {
    const result = parseSlashCommand('/attach file1.txt file2.txt', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'attach');
    assert.equal(result.isBuiltIn, true);
    assert.equal(result.args, 'file1.txt file2.txt');
  });

  test('parses built-in detach command', () => {
    const result = parseSlashCommand('/detach', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'detach');
    assert.equal(result.isBuiltIn, true);
    assert.equal(result.args, '');
  });

  test('parses skill command', () => {
    const result = parseSlashCommand('/git-commit fix bug', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'git-commit');
    assert.equal(result.skillName, 'git-commit');
    assert.equal(result.isBuiltIn, false);
    assert.equal(result.args, 'fix bug');
  });

  test('parses skill command without args', () => {
    const result = parseSlashCommand('/summarize-file', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.command, 'summarize-file');
    assert.equal(result.skillName, 'summarize-file');
    assert.equal(result.args, '');
  });

  test('returns undefined for unknown command', () => {
    const result = parseSlashCommand('/unknown command', mockSkills);
    assert.equal(result, undefined);
  });

  test('handles skill name without dashes', () => {
    const result = parseSlashCommand('/gitcommit fix', mockSkills);
    assert.ok(result !== undefined);
    assert.equal(result.skillName, 'git-commit');
  });
});

describe('buildHelpMessage', () => {
  test('includes built-in commands', () => {
    const help = buildHelpMessage(mockSkills);
    assert.ok(help.includes('/help'));
    assert.ok(help.includes('/clear'));
    assert.ok(help.includes('/threads'));
    assert.ok(help.includes('/attach'));
    assert.ok(help.includes('/detach'));
  });

  test('includes skills', () => {
    const help = buildHelpMessage(mockSkills);
    assert.ok(help.includes('/git-commit'));
    assert.ok(help.includes('/summarize-file'));
    assert.ok(help.includes('Draft commit messages'));
  });

  test('includes @ mentions section', () => {
    const help = buildHelpMessage(mockSkills);
    assert.ok(help.includes('@ Mentions'));
    assert.ok(help.includes('@path/to/file'));
  });
});
