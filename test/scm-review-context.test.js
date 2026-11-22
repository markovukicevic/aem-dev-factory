import test from 'node:test';
import assert from 'node:assert/strict';
import { readScmReviewContext } from '../src/scm-review-context.js';
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);

test('combines GitLab, Bitbucket and Azure evidence without overstating completeness', async () => {
  const scms = [
    { provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: { head_sha: a, base_sha: b, start_sha: c } }), getPullRequestComments: async () => [], getMergeRequestCommits: async () => [] },
    { provider: 'bitbucket-cloud', getPullRequest: async () => ({ id: 7, source: { commit: { hash: a } }, destination: { commit: { hash: b } } }), getPullRequestComments: async () => [], getPullRequestCommits: async () => [] },
    { provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) },
  ];
  const results = await Promise.all(scms.map(scm => readScmReviewContext({ scm, number: 7 })));
  assert.deepEqual(results.map(item => item.revisionConsistency), [true, true, null]);
  assert.equal(results[0].commitData.commitListComplete, null);
  assert.equal(results[2].discussion.discussionComplete, null);
  assert.equal(results[2].commitData.paginationComplete, null);
});

test('rejects an MR changed between discussion and commit evidence', async () => {
  let calls = 0;
  const refs = { head_sha: a, base_sha: b, start_sha: c };
  const scm = { provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: ++calls === 1 ? refs : { ...refs, head_sha: c } }), getPullRequestComments: async () => [], getMergeRequestCommits: async () => [] };
  await assert.rejects(readScmReviewContext({ scm, number: 7 }), /changed/);
});
