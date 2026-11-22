import test from 'node:test';
import assert from 'node:assert/strict';
import { readScmPrCommits } from '../src/scm-pr-commits.js';
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);

test('routes each SCM while preserving its completeness semantics', async () => {
  const providers = [
    { provider: 'github', getPullRequest: async () => ({ number: 7, head: { sha: a }, base: { sha: b }, commits: 0 }) },
    { provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: { head_sha: a, base_sha: b, start_sha: c } }), getMergeRequestCommits: async () => [] },
    { provider: 'bitbucket-cloud', getPullRequest: async () => ({ id: 7, source: { commit: { hash: a } }, destination: { commit: { hash: b } } }), getPullRequestCommits: async () => [] },
    { provider: 'ado', getPullRequestCommitPage: async (_id, options) => ({ values: [], continuationToken: options.continuationToken ? null : 'next' }) },
  ];
  const results = await Promise.all(providers.map(scm => readScmPrCommits({ scm, number: 7 })));
  assert.deepEqual(results.map(item => item.provider), providers.map(item => item.provider));
  assert.equal(results[0].commitListComplete, true);
  assert.equal(results[1].commitListComplete, null);
  assert.equal(results[2].paginationComplete, true);
  assert.equal(results[3].paginationComplete, null);
  assert.equal((await readScmPrCommits({ scm: providers[3], number: 7, continuationToken: 'next' })).continuationToken, null);
  await assert.rejects(readScmPrCommits({ scm: providers[0], number: 7, continuationToken: 'next' }), /only for Azure/);
  await assert.rejects(readScmPrCommits({ scm: { provider: 'unknown' }, number: 7 }), /Unsupported/);
});
