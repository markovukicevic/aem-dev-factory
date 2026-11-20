import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRepositoryPath } from '../src/github.js';

test('constructs a repository endpoint for a configured owner and repository', () => {
  assert.equal(githubRepositoryPath('my-team', 'aem.project'), '/repos/my-team/aem.project');
});

test('rejects missing or unsafe repository path segments', () => {
  for (const value of ['', ' ', '../private', 'a/b', 'repo?x=1', '.', '..', undefined]) {
    assert.throws(() => githubRepositoryPath('team', value), TypeError);
    assert.throws(() => githubRepositoryPath(value, 'repo'), TypeError);
  }
});
