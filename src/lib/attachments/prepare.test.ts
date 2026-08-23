import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareAttachment } from './prepare.js';

describe('prepareAttachment', () => {
  test('prepares text file without truncation', async () => {
    const testDir = path.join(tmpdir(), `attach-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'test.txt');
    const content = 'Hello, world!';
    
    try {
      await writeFile(testFile, content, 'utf8');
      const result = await prepareAttachment(testFile);
      
      assert.equal(result.kind, 'text');
      assert.equal(result.originalPath, testFile);
      assert.equal(result.text, content);
      assert.equal(result.truncated, false);
      assert.equal(result.size, content.length);
    } finally {
      await unlink(testFile).catch(() => {});
    }
  });

  test('truncates large text files', async () => {
    const testDir = path.join(tmpdir(), `attach-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'large.txt');
    const maxSize = 100;
    const content = 'x'.repeat(200);
    
    try {
      await writeFile(testFile, content, 'utf8');
      const result = await prepareAttachment(testFile, maxSize);
      
      assert.equal(result.kind, 'text');
      assert.equal(result.truncated, true);
      assert.ok(result.text !== undefined);
      assert.ok(result.text.includes('[Text file truncated'));
      assert.ok(result.text.length <= maxSize + 100);
    } finally {
      await unlink(testFile).catch(() => {});
    }
  });

  test('prepares image as pass-through', async () => {
    const testDir = path.join(tmpdir(), `attach-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'image.png');
    
    try {
      await writeFile(testFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'binary');
      const result = await prepareAttachment(testFile);
      
      assert.equal(result.kind, 'image');
      assert.equal(result.originalPath, testFile);
      assert.equal(result.imagePath, testFile);
    } finally {
      await unlink(testFile).catch(() => {});
    }
  });

  test('skips binary files', async () => {
    const testDir = path.join(tmpdir(), `attach-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'binary.bin');
    
    try {
      await writeFile(testFile, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      const result = await prepareAttachment(testFile);
      
      assert.equal(result.kind, 'binary-skipped');
      assert.equal(result.originalPath, testFile);
      assert.ok(result.text !== undefined);
      assert.ok(result.text.includes('[Binary file skipped'));
    } finally {
      await unlink(testFile).catch(() => {});
    }
  });

  test('handles JSON files as text', async () => {
    const testDir = path.join(tmpdir(), `attach-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'data.json');
    const content = JSON.stringify({ test: 'data' });
    
    try {
      await writeFile(testFile, content, 'utf8');
      const result = await prepareAttachment(testFile);
      
      assert.equal(result.kind, 'text');
      assert.equal(result.text, content);
    } finally {
      await unlink(testFile).catch(() => {});
    }
  });

  test('throws error for non-existent file', async () => {
    const nonExistent = path.join(tmpdir(), 'does-not-exist.txt');
    await assert.rejects(
      async () => await prepareAttachment(nonExistent),
      /Cannot access file/,
    );
  });
});
