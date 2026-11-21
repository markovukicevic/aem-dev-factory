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

test('reads check runs and combined commit status for an explicit commit', async () => {
  const calls = [];
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ state: 'success' }) };
  } });
  await client.listCheckRuns('123abcd', { page: 2 });
  assert.deepEqual(await client.getCommitStatus('123abcd'), { state: 'success' });
  assert.deepEqual(calls, [
    'https://api.github.com/repos/team/site/commits/123abcd/check-runs?per_page=100&page=2',
    'https://api.github.com/repos/team/site/commits/123abcd/status',
  ]);
  assert.throws(() => client.listCheckRuns('../main'), TypeError);
  assert.throws(() => client.getCommitStatus('main'), TypeError);
});

test('reads a GitHub issue and rejects invalid issue numbers', async () => {
  let url;
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async value => {
    url = value;
    return { ok: true, json: async () => ({ number: 31, title: 'Example' }) };
  } });
  assert.deepEqual(await client.getIssue(31), { number: 31, title: 'Example' });
  assert.equal(url, 'https://api.github.com/repos/team/site/issues/31');
  assert.throws(() => client.getIssue(-1), TypeError);
});

test('queries open pull requests for the exact head and base', async () => {
  let url;
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async value => { url = value; return { ok: true, json: async () => [] }; } });
  assert.deepEqual(await client.listOpenPullRequests({ owner: 'team', head: 'feature/x', base: 'main' }), []);
  const query = new URL(url).searchParams;
  assert.equal(query.get('head'), 'team:feature/x');
  assert.equal(query.get('base'), 'main');
  assert.equal(query.get('state'), 'open');
});

test('reads a page of workflow runs for a commit and an individual run', async () => {
  const urls = [];
  const client = createGitHubClient({ owner: 'team', repository: 'site', token: 'secret', fetchImpl: async url => { urls.push(url); return { ok: true, json: async () => ({}) }; } });
  await client.listWorkflowRuns({ sha: '123abcd', page: 2 });
  await client.getWorkflowRun(42);
  const query = new URL(urls[0]).searchParams;
  assert.equal(query.get('head_sha'), '123abcd');
  assert.equal(query.get('page'), '2');
  assert.match(urls[1], /\/actions\/runs\/42$/);
  assert.throws(() => client.getWorkflowRun(0));
  assert.throws(() => client.listWorkflowRuns({ sha: 'main' }));
});
