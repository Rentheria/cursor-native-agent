import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  applyMemoryWritesFromText,
  formatMemoryDetailMarkdown,
  formatMemoryIndexLine,
  parseMemoryWriteBlocks,
  slugifyMemoryTitle,
  stripMemoryWriteBlocks,
  writeMemoryEntry,
} from './memory-writer.js';

describe('slugifyMemoryTitle', () => {
  it('debería_kebab_case_y_quitar_acentos', () => {
    assert.equal(slugifyMemoryTitle('Preferencia Meetup GDL'), 'preferencia-meetup-gdl');
    assert.equal(slugifyMemoryTitle('  Front-row seats!  '), 'front-row-seats');
  });
});

describe('formatMemoryDetailMarkdown', () => {
  it('debería_emitir_frontmatter_índice_compatible', () => {
    const md = formatMemoryDetailMarkdown({
      slug: 'front-row',
      title: 'Front row',
      hook: 'front row seats',
      description: 'Prefers front-row seats at meetups',
      memoryType: 'preference',
      body: 'Sit near the front for demos.',
    });
    assert.match(md, /^---\nname: front-row\n/);
    assert.match(md, /metadata:\n  type: preference\n---/);
    assert.match(md, /Sit near the front/);
  });
});

describe('formatMemoryIndexLine', () => {
  it('debería_usar_el_formato_del_índice', () => {
    assert.equal(
      formatMemoryIndexLine({
        title: 'Front row',
        relativePath: 'memory/front-row.md',
        hook: 'front row seats meetup',
      }),
      '- [Front row](memory/front-row.md) — front row seats meetup',
    );
  });
});

describe('parseMemoryWriteBlocks + strip', () => {
  it('debería_parsear_y_quitar_bloques', () => {
    const text = `I will remember that.

<<<MEMORY_WRITE
slug: front-row
title: Front row preference
hook: front row seats meetup
type: preference
description: Prefers sitting near the front at meetups
---
Sit near the front so demos are easy to see.
MEMORY_WRITE>>>

Done.`;

    const parsed = parseMemoryWriteBlocks(text);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.input.slug, 'front-row');
    assert.equal(parsed[0]?.input.memoryType, 'preference');
    assert.match(parsed[0]?.input.body ?? '', /Sit near the front/);

    const cleaned = stripMemoryWriteBlocks(text);
    assert.doesNotMatch(cleaned, /MEMORY_WRITE/);
    assert.match(cleaned, /I will remember that/);
    assert.match(cleaned, /Done/);
  });

  it('debería_slugificar_si_falta_slug', () => {
    const text = `<<<MEMORY_WRITE
title: Demo Preference
hook: demo preference
type: fact
description: A demo preference
---
Body text here.
MEMORY_WRITE>>>`;
    const parsed = parseMemoryWriteBlocks(text);
    assert.equal(parsed[0]?.input.slug, 'demo-preference');
  });
});

describe('writeMemoryEntry + applyMemoryWritesFromText', () => {
  it('debería_crear_detalle_y_línea_de_índice_de_forma_visible', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cna-memory-'));
    await writeFile(
      path.join(root, 'MEMORY.md'),
      [
        '# MEMORY — Long-term index',
        '',
        '- [Existing](memory/existing.md) — already there',
        '',
      ].join('\n'),
      'utf8',
    );

    const logs: string[] = [];
    const text = `Saving now.

<<<MEMORY_WRITE
slug: front-row
title: Front row preference
hook: front row seats meetup
type: preference
description: Prefers sitting near the front at meetups
---
Sit near the front so demos are easy to see.
MEMORY_WRITE>>>
`;

    const { cleanedText, writes } = await applyMemoryWritesFromText(
      root,
      text,
      (message) => {
        logs.push(message);
      },
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.detailCreated, true);
    assert.equal(writes[0]?.indexLineAdded, true);
    assert.equal(writes[0]?.relativeLink, 'memory/front-row.md');

    const detail = await readFile(path.join(root, 'memory', 'front-row.md'), 'utf8');
    assert.match(detail, /metadata:\n  type: preference/);
    assert.match(detail, /Sit near the front/);

    const index = await readFile(path.join(root, 'MEMORY.md'), 'utf8');
    assert.match(
      index,
      /- \[Front row preference\]\(memory\/front-row\.md\) — front row seats meetup/,
    );
    assert.match(index, /memory\/existing\.md/);

    assert.equal(logs.length, 2);
    assert.match(logs[0] ?? '', /^\[memory\] Writing memory\/front-row\.md/);
    assert.match(logs[1] ?? '', /^\[memory\] created memory\/front-row\.md/);
    assert.doesNotMatch(cleanedText, /MEMORY_WRITE/);
  });

  it('debería_no_duplicar_la_línea_del_índice_al_reescribir', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cna-memory-'));
    await writeMemoryEntry(root, {
      slug: 'front-row',
      title: 'Front row preference',
      hook: 'front row seats',
      description: 'Prefers front row',
      memoryType: 'preference',
      body: 'First body.',
    });
    const again = await writeMemoryEntry(root, {
      slug: 'front-row',
      title: 'Front row preference',
      hook: 'front row seats',
      description: 'Prefers front row',
      memoryType: 'preference',
      body: 'Updated body.',
    });
    assert.equal(again.detailCreated, false);
    assert.equal(again.indexLineAdded, false);

    const index = await readFile(path.join(root, 'MEMORY.md'), 'utf8');
    const matches = index.match(/memory\/front-row\.md/g) ?? [];
    assert.equal(matches.length, 1);

    const detail = await readFile(path.join(root, 'memory', 'front-row.md'), 'utf8');
    assert.match(detail, /Updated body/);
  });
});
