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
