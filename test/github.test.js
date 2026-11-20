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

import { createGitHubClient } from '../src/github.js';

test('reads a pull request with authenticated GitHub headers', async () => {
  let call;
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async (...args) => {
    call = args;
    return { ok: true, json: async () => ({ number: 7 }) };
  } });
  assert.deepEqual(await client.getPullRequest(7), { number: 7 });
  assert.equal(call[0], 'https://api.github.com/repos/team/site/pulls/7');
  assert.equal(call[1].method, 'GET');
  assert.equal(call[1].headers.Authorization, 'Bearer secret');
  assert.equal(call[1].redirect, 'error');
  assert.throws(() => client.getPullRequest(0), TypeError);
});

test('creates a pull request with explicit branch and draft fields', async () => {
  let call;
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async (...args) => {
    call = args;
    return { ok: true, json: async () => ({ number: 8 }) };
  } });
  assert.deepEqual(await client.createPullRequest({ title: 'Change', head: 'feature', base: 'main', draft: true }), { number: 8 });
  assert.equal(call[1].method, 'POST');
  assert.deepEqual(JSON.parse(call[1].body), { title: 'Change', head: 'feature', base: 'main', body: '', draft: true });
  assert.throws(() => client.createPullRequest({ title: '', head: 'a', base: 'b' }), TypeError);
});

test('reports API failures without leaking the token or response body', async () => {
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(client.getPullRequest(1), error => error.message === 'GitHub request failed (403)' && error.status === 403);
});

test('reads separate pages of review and conversation comments', async () => {
  const calls = [];
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => [{ id: 1 }] };
  } });
  assert.deepEqual(await client.listReviewComments(7, { page: 2, perPage: 20 }), [{ id: 1 }]);
  await client.listIssueComments(7);
  assert.deepEqual(calls, [
    'https://api.github.com/repos/team/site/pulls/7/comments?per_page=20&page=2',
    'https://api.github.com/repos/team/site/issues/7/comments?per_page=100&page=1',
  ]);
  assert.throws(() => client.listReviewComments(-1), TypeError);
  assert.throws(() => client.listIssueComments(7, { perPage: 101 }), TypeError);
  assert.throws(() => client.listIssueComments(7, { page: 0 }), TypeError);
});
