import test from 'node:test';
import assert from 'node:assert/strict';
import { createScmProvider } from '../src/providers.js';
import { readBitbucketPrCommits } from '../src/bitbucket-pr-commits.js';
const source = 'a'.repeat(40), destination = 'b'.repeat(40);
const pr = { id: 7, source: { commit: { hash: source } }, destination: { commit: { hash: destination } } };

test('reads pages with scoped links and checks revisions', async () => {
  const requests = [];
  const base = 'https://api.bitbucket.org/2.0/repositories/team/site/pullrequests/7/commits';
  const scm = createScmProvider({ provider: 'bitbucket-cloud', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl: async url => {
    requests.push(url);
    const data = url.includes('/commits?') ? (url.includes('page=2') ? { values: [{ hash: 'd'.repeat(40) }] } : { values: [{ hash: 'c'.repeat(40) }], next: `${base}?page=2` }) : pr;
    return { ok: true, json: async () => data };
  } });
  const result = await readBitbucketPrCommits({ scm, number: 7 });
  assert.equal(result.commits.length, 2);
  assert.equal(result.paginationComplete, true);
  assert.equal(requests.length, 4);
});

test('rejects unsafe page links, duplicate commits and moving PRs', async () => {
  let reads = 0;
  const scm = { provider: 'bitbucket-cloud', getPullRequest: async () => pr, getPullRequestCommits: async () => [{ hash: source }, { hash: source }] };
  await assert.rejects(readBitbucketPrCommits({ scm, number: 7 }), /repeated/);
  await assert.rejects(readBitbucketPrCommits({ scm: { ...scm, getPullRequestCommits: async () => [], getPullRequest: async () => ++reads === 1 ? pr : { ...pr, source: { commit: { hash: 'c'.repeat(40) } } } }, number: 7 }), /changed/);
  const unsafe = createScmProvider({ provider: 'bitbucket-cloud', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl: async url => ({ ok: true, json: async () => url.includes('/commits?') ? { values: [], next: 'https://evil.example/steal' } : pr }) });
  await assert.rejects(readBitbucketPrCommits({ scm: unsafe, number: 7 }), /next page/);
});
