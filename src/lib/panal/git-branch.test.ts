import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isProtectedBranch, readGitBranch } from './git-branch.js';

describe('isProtectedBranch', () => {
  it('debería_tratar_main_y_master_como_protegidas', () => {
    assert.equal(isProtectedBranch('main'), true);
    assert.equal(isProtectedBranch('master'), true);
    assert.equal(isProtectedBranch('MAIN'), true);
    assert.equal(isProtectedBranch('feat/windows'), false);
    assert.equal(isProtectedBranch(undefined), false);
  });
});

describe('readGitBranch', () => {
  it('debería_devolver_el_nombre_de_rama', () => {
    assert.equal(
      readGitBranch('/repo', () => 'feat/foo\n'),
      'feat/foo',
    );
  });

  it('debería_devolver_undefined_si_git_falla', () => {
    assert.equal(
      readGitBranch('/repo', () => {
        throw new Error('not a git repo');
      }),
      undefined,
    );
  });
});
