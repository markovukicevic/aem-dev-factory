import test from 'node:test';
import assert from 'node:assert/strict';
import { readGitHubReviewContext } from '../src/github-review-context.js';

const head = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = { number: 7, head: { sha: head }, base: { sha: base }, changed_files: 1, commits: 1 };
function providers() {
  return { scm: { provider: 'github', getPullRequest: async () => pr, listPullRequestFiles: async () => [{ filename: 'one.js' }], listPullRequestCommits: async () => [{ sha: head }], listIssueComments: async () => [], listReviewComments: async () => [], listReviews: async () => [] }, ci: { provider: 'github-actions', listCheckRuns: async sha => { assert.equal(sha, head); return { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }; }, getCommitStatus: async () => ({ total_count: 0 }) } };
}
test('joins PR discussion, changed files and observed CI at the same revisions', async () => {
  const result = await readGitHubReviewContext({ ...providers(), number: 7 });
  assert.equal(result.fileData.files[0].filename, 'one.js');
  assert.equal(result.ciSummary.state, 'success');
  assert.equal(result.commitData.commits[0].sha, head);
  assert.equal(result.commitData.commitListComplete, true);
  assert.equal(result.head, head);
  assert.match(result.limitations.join(' '), /fork/);
});
test('refuses mixed revisions and provider types', async () => {
  const p = providers();
  let count = 0;
  p.scm.getPullRequest = async () => ++count >= 4 ? { ...pr, head: { sha: 'c'.repeat(40) } } : pr;
  await assert.rejects(readGitHubReviewContext({ ...p, number: 7 }), /changed/);
  await assert.rejects(readGitHubReviewContext({ ...providers(), ci: { provider: 'gitlab-ci' }, number: 7 }), /required/);
});


test('refuses a commit count change during review collection', async () => {
  const p = providers();
  let count = 0;
  p.scm.getPullRequest = async () => ++count >= 6 ? { ...pr, commits: 2 } : pr;
  await assert.rejects(readGitHubReviewContext({ ...p, number: 7 }), /changed/);
});
