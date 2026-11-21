import test from 'node:test';
import assert from 'node:assert/strict';
import { readPullRequestContext } from '../src/pr-context.js';
import { createScmProvider } from '../src/providers.js';

test('GitHub context reads each discussion type and multiple pages', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    let data = { number: 7, title: 'Change' };
    if (url.includes('/issues/7/comments')) data = [{ id: 201, body: 'issue comment' }];
    if (url.includes('/pulls/7/reviews')) data = [{ id: 301, state: 'APPROVED' }];
    if (url.includes('/pulls/7/comments')) data = new URL(url).searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) : [{ id: 101 }];
    return { ok: true, json: async () => data };
  };
  const scm = createScmProvider({ provider: 'github', owner: 'team', repository: 'site' }, { token: 'secret', fetchImpl });
  const context = await readPullRequestContext({ scm, number: 7 });
  assert.equal(context.reviewComments.length, 101);
  assert.equal(context.comments[0].body, 'issue comment');
  assert.equal(context.reviews[0].state, 'APPROVED');
  assert.equal(context.discussionComplete, true);
  assert.ok(calls.some(url => url.includes('/pulls/7/reviews?')));
});

test('GitHub context fails closed on repeated, malformed or truncated comments', async () => {
  const scm = { provider: 'github', getPullRequest: async () => ({}), listIssueComments: async () => [], listReviews: async () => [], listReviewComments: async () => Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) };
  await assert.rejects(readPullRequestContext({ scm, number: 1, maxPages: 2 }), /repeated/);
  await assert.rejects(readPullRequestContext({ scm, number: 1, maxPages: 1 }), /incomplete/);
  await assert.rejects(readPullRequestContext({ scm: { ...scm, listReviewComments: async () => ({}) }, number: 1 }), /Invalid/);
});

test('provider contexts preserve raw comments and flag Azure uncertainty', async () => {
  for (const provider of ['gitlab', 'bitbucket-cloud']) {
    const result = await readPullRequestContext({ number: 4, scm: { provider, getPullRequest: async () => ({ title: 'Change' }), getPullRequestComments: async () => [{ body: 'Comment' }] } });
    assert.equal(result.comments[0].body, 'Comment');
    assert.equal(result.discussionComplete, true);
  }
  const azure = await readPullRequestContext({ number: 4, scm: { provider: 'ado', getPullRequest: async () => ({}), getPullRequestThreads: async () => ({ value: [{ id: 3 }] }) } });
  assert.equal(azure.discussionComplete, null);
  assert.equal(azure.threads[0].id, 3);
  await assert.rejects(readPullRequestContext({ number: 4, scm: { provider: 'ado', getPullRequest: async () => ({}), getPullRequestThreads: async () => ({}) } }), /Invalid/);
});
