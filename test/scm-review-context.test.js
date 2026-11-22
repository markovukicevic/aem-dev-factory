import test from 'node:test';
import assert from 'node:assert/strict';
import { readScmReviewContext } from '../src/scm-review-context.js';
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);

test('combines GitLab, Bitbucket and Azure evidence without overstating completeness', async () => {
  const scms = [
    { provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: { head_sha: a, base_sha: b, start_sha: c } }), getPullRequestComments: async () => [], getMergeRequestCommits: async () => [], listMergeRequestDiffs: async () => ({ values: [], nextPage: null }) },
    { provider: 'bitbucket-cloud', getPullRequest: async () => ({ id: 7, source: { commit: { hash: a } }, destination: { commit: { hash: b } } }), getPullRequestComments: async () => [], getPullRequestCommits: async () => [], getPullRequestDiffstat: async () => [] },
    { provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) },
  ];
  const results = await Promise.all(scms.map(scm => readScmReviewContext({ scm, number: 7 })));
  assert.deepEqual(results.map(item => item.revisionConsistency), [true, true, null]);
  assert.equal(results[0].commitData.commitListComplete, null);
  assert.equal(results[0].fileData.diffComplete, null);
  assert.deepEqual(results[1].fileData.files, []);
  assert.equal(results[2].fileData, null);
  assert.equal(results[2].discussion.discussionComplete, null);
  assert.equal(results[2].commitData.paginationComplete, null);
});

test('rejects an MR changed between discussion and commit evidence', async () => {
  let calls = 0;
  const refs = { head_sha: a, base_sha: b, start_sha: c };
  const scm = { provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: ++calls === 1 ? refs : { ...refs, head_sha: c } }), getPullRequestComments: async () => [], getMergeRequestCommits: async () => [], listMergeRequestDiffs: async () => ({ values: [], nextPage: null }) };
  await assert.rejects(readScmReviewContext({ scm, number: 7 }), /changed/);
});


test('rejects file evidence collected at a different Bitbucket revision', async () => {
  let calls = 0;
  const initial = { id: 7, source: { commit: { hash: a } }, destination: { commit: { hash: b } } };
  const changed = { ...initial, source: { commit: { hash: c } } };
  const scm = { provider: 'bitbucket-cloud', getPullRequest: async () => ++calls <= 3 ? initial : changed, getPullRequestComments: async () => [], getPullRequestCommits: async () => [], getPullRequestDiffstat: async () => [] };
  await assert.rejects(readScmReviewContext({ scm, number: 7 }), /changed/);
});


test('includes only an explicitly selected Azure iteration without asserting it is current', async () => {
  const scm = { provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }), getIterationChanges: async (_id, iteration) => ({ changes: [{ iteration }], complete: true }) };
  const result = await readScmReviewContext({ scm, number: 7, iteration: 2 });
  assert.equal(result.fileData.iteration, 2);
  assert.equal(result.fileData.changes[0].iteration, 2);
  assert.equal(result.revisionConsistency, null);
  assert.match(result.limitations.join(' '), /not verified as current/);
  await assert.rejects(readScmReviewContext({ scm, number: 7, iteration: 0 }), /Iteration/);
  await assert.rejects(readScmReviewContext({ scm: { provider: 'github' }, number: 7, iteration: 2 }), /Iteration/);
});
