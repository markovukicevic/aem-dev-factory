import test from 'node:test';
import assert from 'node:assert/strict';
import { readAzureCommitBuilds } from '../src/ado-commit-builds.js';
const sha = 'a'.repeat(40);

test('matches only exact commit versions across Azure build pages', async () => {
  const calls = [];
  const ci = { provider: 'ado-pipelines', listBuilds: async input => { calls.push(input); return calls.length === 1 ? { values: [{ id: 1, sourceVersion: sha.toUpperCase() }, { id: 2 }], continuationToken: 'next' } : { values: [{ id: 3, sourceVersion: 'b'.repeat(40) }], continuationToken: null }; } };
  const result = await readAzureCommitBuilds({ ci, branch: 'feature/test', sha });
  assert.deepEqual(result.builds.map(build => build.id), [1]);
  assert.equal(result.unattributedBuilds, 1);
  assert.equal(result.paginationComplete, true);
  assert.equal(calls[1].continuationToken, 'next');
  assert.match(result.scope, /not verified/);
});

test('reports a bounded result and rejects repeated continuation tokens', async () => {
  const ci = { provider: 'ado-pipelines', listBuilds: async () => ({ values: [], continuationToken: 'again' }) };
  assert.equal((await readAzureCommitBuilds({ ci, branch: 'main', sha, maxPages: 1 })).paginationComplete, false);
  await assert.rejects(readAzureCommitBuilds({ ci, branch: 'main', sha, maxPages: 3 }), /repeated/);
  await assert.rejects(readAzureCommitBuilds({ ci, branch: 'main', sha: 'abc1234' }), /full/);
});
