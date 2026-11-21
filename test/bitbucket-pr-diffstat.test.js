import test from 'node:test';
import assert from 'node:assert/strict';
import { createScmProvider } from '../src/providers.js';
import { readBitbucketPrDiffstat } from '../src/bitbucket-pr-diffstat.js';
const pr = { id: 7, source: { commit: { hash: 'a'.repeat(40) } }, destination: { commit: { hash: 'b'.repeat(40) } } };
const target = 'https://api.bitbucket.org/2.0/repositories/team/site/diffstat/abc1234..def5678';

test('validates redirect and reads paginated diffstat with stable revisions', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/pullrequests/7')) return { ok: true, json: async () => pr };
    if (url.endsWith('/pullrequests/7/diffstat')) return { status: 302, headers: { get: () => target } };
    if (url.includes('page=2')) return { ok: true, json: async () => ({ values: [{ status: 'added' }] }) };
    return { ok: true, json: async () => ({ values: [{ status: 'modified' }], next: `${target}?page=2` }) };
  };
  const scm = createScmProvider({ provider: 'bitbucket-cloud', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl });
  const result = await readBitbucketPrDiffstat({ scm, number: 7 });
  assert.deepEqual(result.files.map(item => item.status), ['modified', 'added']);
  assert.equal(calls[1].options.redirect, 'manual');
  assert.equal(calls[2].options.redirect, 'error');
  assert.match(result.limitations[0], /not a full code diff/);
});

test('refuses unsafe redirects without sending credentials to their targets', async () => {
  for (const target of ['https://evil.example/2.0/repositories/team/site/diffstat/a', 'https://api.bitbucket.org/2.0/repositories/other/site/diffstat/a', 'http://api.bitbucket.org/2.0/repositories/team/site/diffstat/a', 'https://api.bitbucket.org/2.0/repositories/team/site/diffstat/a%2Fb']) {
    let calls = 0;
    const scm = createScmProvider({ provider: 'bitbucket-cloud', workspace: 'team', repository: 'site' }, { bitbucketToken: 'secret', fetchImpl: async () => { calls++; return { status: 302, headers: { get: () => target } }; } });
    await assert.rejects(scm.getPullRequestDiffstat(7), /Invalid Bitbucket diffstat redirect/);
    assert.equal(calls, 1);
  }
});

test('rejects changed PR revisions', async () => {
  let reads = 0;
  const scm = { provider: 'bitbucket-cloud', getPullRequest: async () => ++reads === 1 ? pr : { ...pr, source: { commit: { hash: 'c'.repeat(40) } } }, getPullRequestDiffstat: async () => [] };
  await assert.rejects(readBitbucketPrDiffstat({ scm, number: 7 }), /changed/);
});
