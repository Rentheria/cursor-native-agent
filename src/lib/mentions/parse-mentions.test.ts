import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseMentions } from './parse-mentions.js';

describe('parseMentions', () => {
  test('parses no mentions', async () => {
    const result = await parseMentions('hello world', '/tmp');
    assert.equal(result.mentions.length, 0);
    assert.equal(result.cleanedPrompt, 'hello world');
  });

  test('parses file mention', async () => {
    const testDir = path.join(tmpdir(), `mentions-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'test.txt');
    await writeFile(testFile, 'file content', 'utf8');

    try {
      const result = await parseMentions(`check @${testFile} please`, testDir);
      assert.equal(result.mentions.length, 1);
      assert.equal(result.mentions[0]?.kind, 'file');
      assert.equal(result.mentions[0]?.content, 'file content');
      assert.equal(result.mentions[0]?.truncated, false);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test('parses relative path mention', async () => {
    const testDir = path.join(tmpdir(), `mentions-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'test.txt');
    await writeFile(testFile, 'content', 'utf8');

    try {
      const result = await parseMentions('check @test.txt', testDir);
      assert.equal(result.mentions.length, 1);
      assert.equal(result.mentions[0]?.kind, 'file');
      assert.equal(result.mentions[0]?.content, 'content');
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test('parses directory mention', async () => {
    const testDir = path.join(tmpdir(), `mentions-test-${String(Date.now())}`);
    const subDir = path.join(testDir, 'subdir');
    await mkdir(subDir, { recursive: true });
    await writeFile(path.join(subDir, 'file1.txt'), 'a', 'utf8');
    await writeFile(path.join(subDir, 'file2.txt'), 'b', 'utf8');

    try {
      const result = await parseMentions('@subdir/', testDir);
      assert.equal(result.mentions.length, 1);
      assert.equal(result.mentions[0]?.kind, 'directory');
      assert.ok(result.mentions[0]?.content?.includes('file1.txt'));
      assert.ok(result.mentions[0]?.content?.includes('file2.txt'));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test('handles non-existent file', async () => {
    const result = await parseMentions('@nonexistent.txt', '/tmp');
    assert.equal(result.mentions.length, 1);
    assert.ok(result.mentions[0]?.error !== undefined);
    assert.ok(result.mentions[0]?.error.includes('Cannot access'));
  });

  test('parses multiple mentions', async () => {
    const testDir = path.join(tmpdir(), `mentions-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(path.join(testDir, 'a.txt'), 'a', 'utf8');
    await writeFile(path.join(testDir, 'b.txt'), 'b', 'utf8');

    try {
      const result = await parseMentions('compare @a.txt and @b.txt', testDir);
      assert.equal(result.mentions.length, 2);
      assert.equal(result.mentions[0]?.content, 'a');
      assert.equal(result.mentions[1]?.content, 'b');
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test('truncates large files', async () => {
    const testDir = path.join(tmpdir(), `mentions-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'large.txt');
    await writeFile(testFile, 'x'.repeat(100_000), 'utf8');

    try {
      const result = await parseMentions(`@${testFile}`, testDir);
      assert.equal(result.mentions.length, 1);
      assert.equal(result.mentions[0]?.truncated, true);
      assert.ok(result.mentions[0]?.content?.includes('[File truncated'));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});
