import test from 'node:test';
import assert from 'node:assert/strict';
import { readReviewCiContext } from '../src/review-ci-context.js';
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const makeGitLab = () => ({ provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: { head_sha: a, base_sha: b, start_sha: c } }), getPullRequestComments: async () => [], getMergeRequestCommits: async () => [], listMergeRequestDiffs: async () => ({ values: [], nextPage: null }) });
const ci = { provider: 'gitlab-ci', listAllPipelines: async () => [{ sha: a, status: 'running' }] };

test('matches configured CI to the observed PR SHA without claiming repository identity', async () => {
  const result = await readReviewCiContext({ scm: makeGitLab(), ci, number: 7, sha: a });
  assert.equal(result.prHeadMatchesSha, true);
  assert.equal(result.ci.states[0].state, 'running');
  assert.match(result.limitations.join(' '), /not verified to match/);
  await assert.rejects(readReviewCiContext({ scm: makeGitLab(), ci, number: 7, sha: b }), /does not match/);
});

test('rejects a PR revision change while CI is read', async () => {
  const scm = makeGitLab();
  let calls = 0;
  scm.getPullRequest = async () => ({ iid: 7, diff_refs: { head_sha: ++calls > 5 ? c : a, base_sha: b, start_sha: c } });
  await assert.rejects(readReviewCiContext({ scm, ci, number: 7, sha: a }), /changed/);
});

test('keeps Azure PR head matching unknown', async () => {
  const scm = { provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) };
  const result = await readReviewCiContext({ scm, ci, number: 7, sha: a });
  assert.equal(result.prHeadMatchesSha, null);
  assert.match(result.limitations.join(' '), /not verified against it/);
});
