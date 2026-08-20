import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFrontmatter, parseTriggerList } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('debería_extraer_name_description_y_body_cuando_hay_frontmatter', () => {
    const parsed = parseFrontmatter(`---
name: git-commit
description: Draft commits
triggers: commit, git
---

# Body here
`);

    assert.equal(parsed.attributes['name'], 'git-commit');
    assert.equal(parsed.attributes['description'], 'Draft commits');
    assert.equal(parsed.attributes['triggers'], 'commit, git');
    assert.match(parsed.body, /Body here/);
  });

  it('debería_leer_metadata_type_anidado', () => {
    const parsed = parseFrontmatter(`---
name: demo
description: hook
metadata:
  type: project
---

detail
`);
    const metadata = parsed.attributes['metadata'];
    assert.ok(typeof metadata === 'object' && metadata !== null);
    assert.equal((metadata as Record<string, unknown>)['type'], 'project');
  });
});

describe('parseTriggerList', () => {
  it('debería_partir_por_comas_y_normalizar', () => {
    assert.deepEqual(parseTriggerList('Commit, Git Commit , '), ['commit', 'git commit']);
  });
});
