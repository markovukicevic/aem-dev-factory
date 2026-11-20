import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGitHubIssueContext } from '../src/issue-context.js';

const issue = { number: 7, title: 'Fix issue', body: 'Example', state: 'open', user: { login: 'author' }, labels: [{ name: 'bug' }] };
const comment = id => ({ id, body: `Comment ${id}`, user: { login: 'reviewer' } });

test('collects multiple pages into a normalized issue context', async () => {
  const calls = [];
  const client = { getIssue: async () => issue, listIssueComments: async (_number, { page }) => { calls.push(page); return page === 1 ? Array.from({ length: 100 }, (_, i) => comment(i + 1)) : [comment(101)]; } };
  const result = await fetchGitHubIssueContext({ client, number: 7 });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.comments.length, 101);
  assert.equal(result.comments[100].body, 'Comment 101');
  assert.deepEqual(result.labels, ['bug']);
  assert.equal(result.author, 'author');
});

test('fails rather than returning incomplete comments or treating a PR as an issue', async () => {
  const client = { getIssue: async () => issue, listIssueComments: async () => Array.from({ length: 100 }, (_, i) => comment(i + 1)) };
  await assert.rejects(fetchGitHubIssueContext({ client, number: 7, maxPages: 1 }), /incomplete/);
  await assert.rejects(fetchGitHubIssueContext({ client: { ...client, getIssue: async () => ({ ...issue, pull_request: {} }) }, number: 7 }), /Expected a GitHub issue/);
  await assert.rejects(fetchGitHubIssueContext({ client: { ...client, listIssueComments: async () => ({}) }, number: 7 }), /Invalid/);
});
