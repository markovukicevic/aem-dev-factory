import test from 'node:test';
import assert from 'node:assert/strict';
import { createBitbucketClient } from '../src/bitbucket.js';
import { createScmProvider, createCiProvider } from '../src/providers.js';

test('reads a Bitbucket PR and paginated comments using the configured workspace', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(options.redirect, 'error');
    const data = url.includes('/comments?') ? url.includes('page=2') ? { values: [{ id: 2 }] } : { values: [{ id: 1 }], next: 'https://api.bitbucket.org/2.0/repositories/team/site/pullrequests/7/comments?page=2' } : { id: 7 };
    return { ok: true, json: async () => data };
  };
  const scm = createScmProvider({ provider: 'bitbucket-cloud', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl });
  assert.equal((await scm.getPullRequest(7)).id, 7);
  assert.deepEqual((await scm.getPullRequestComments(7)).map(item => item.id), [1, 2]);
  assert.equal(calls.length, 3);
});

test('rejects untrusted next URLs, repeated pages and incomplete pagination', async () => {
  for (const next of ['https://evil.example/comments', 'http://api.bitbucket.org/2.0/repositories/team/site/pullrequests/7/comments?page=2', 'https://api.bitbucket.org/2.0/repositories/other/site/pullrequests/7/comments?page=2']) {
    const client = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ values: [], next }) }) });
    await assert.rejects(client.getPullRequestComments(7), /Invalid Bitbucket next page/);
  }
  const client = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', maxPages: 1, fetchImpl: async () => ({ ok: true, json: async () => ({ values: [], next: 'https://api.bitbucket.org/2.0/repositories/team/site/pullrequests/7/comments?page=2' }) }) });
  await assert.rejects(client.getPullRequestComments(7), /incomplete/);
});

test('routes commit status reads through the independently configured CI adapter', async () => {
  let url;
  const ci = createCiProvider({ provider: 'bitbucket-pipelines', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl: async value => { url = value; return { ok: true, json: async () => ({ values: [] }) }; } });
  await ci.getCommitStatuses('123abcd');
  assert.match(url, /\/commit\/123abcd\/statuses\?pagelen=100$/);
  assert.throws(() => ci.getCommitStatuses('../main'));
});

test('submits explicit pull request fields without automatically closing the source branch', async () => {
  let call;
  const client = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', fetchImpl: async (...args) => { call = args; return { ok: true, json: async () => ({ id: 42 }) }; } });
  assert.equal((await client.createPullRequest({ title: 'Change', head: 'feature/123', base: 'main', body: 'Summary', draft: true })).id, 42);
  assert.equal(call[1].method, 'POST');
  assert.deepEqual(JSON.parse(call[1].body), { title: 'Change', description: 'Summary', source: { branch: { name: 'feature/123' } }, destination: { branch: { name: 'main' } }, draft: true, close_source_branch: false });
  assert.throws(() => client.createPullRequest({ title: 'Change', head: '../bad', base: 'main' }));
  assert.throws(() => client.createPullRequest({ title: 'Change', head: 'main', base: 'main' }));
});

test('lists all open PRs for exact source and destination branch filters', async () => {
  const urls = [];
  const client = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', fetchImpl: async url => { urls.push(url); return { ok: true, json: async () => urls.length === 1 ? { values: [], next: 'https://api.bitbucket.org/2.0/repositories/team/site/pullrequests?page=2' } : { values: [{ id: 8 }] } }; } });
  assert.equal((await client.listOpenPullRequests({ head: 'feature/123', base: 'main' }))[0].id, 8);
  const query = new URL(urls[0]).searchParams;
  assert.equal(query.get('state'), 'OPEN');
  assert.match(query.get('q'), /source\.branch\.name = "feature\/123"/);
});

test('collects all Bitbucket commit status pages and rejects unsafe or incomplete pagination', async () => {
  let calls = 0;
  const ci = createCiProvider({ provider: 'bitbucket-pipelines', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ++calls === 1 ? { values: [{ state: 'SUCCESSFUL' }], next: 'https://api.bitbucket.org/2.0/repositories/team/site/commit/123abcd/statuses?page=2' } : { values: [{ state: 'FAILED' }] } }) });
  assert.deepEqual((await ci.getAllCommitStatuses('123abcd')).map(item => item.state), ['SUCCESSFUL', 'FAILED']);
  assert.throws(() => ci.getAllCommitStatuses('../bad'));
  for (const next of ['https://evil.example/statuses?page=2', 'https://api.bitbucket.org/2.0/repositories/other/site/commit/123abcd/statuses?page=2']) {
    const client = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ values: [], next }) }) });
    await assert.rejects(client.getAllCommitStatuses('123abcd'), /Invalid Bitbucket next page/);
  }
  const limited = createBitbucketClient({ workspace: 'team', repository: 'site', token: 'secret', maxPages: 1, fetchImpl: async () => ({ ok: true, json: async () => ({ values: [], next: 'https://api.bitbucket.org/2.0/repositories/team/site/commit/123abcd/statuses?page=2' }) }) });
  await assert.rejects(limited.getAllCommitStatuses('123abcd'), /incomplete/);
});
