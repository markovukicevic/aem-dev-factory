import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoScm } from '../src/ado-scm.js';
import { readAzurePrCommitPage } from '../src/ado-pr-commits.js';
const sha = 'a'.repeat(40);

test('reads an Azure PR commit page and preserves opaque continuation', async () => {
  let request;
  const scm = createAdoScm({ organization: 'org', project: 'site', repository: 'repo', token: 'secret', fetchImpl: async url => { request = url; return { ok: true, headers: { get: name => name === 'x-ms-continuationtoken' ? 'next token' : null }, json: async () => ({ value: [{ commitId: sha }] }) }; } });
  const result = await readAzurePrCommitPage({ scm, number: 7, continuationToken: 'first token' });
  assert.equal(result.commits[0].commitId, sha);
  assert.equal(result.continuationToken, 'next token');
  assert.equal(result.paginationComplete, null);
  assert.equal(new URL(request).searchParams.get('continuationToken'), 'first token');
  assert.equal(new URL(request).searchParams.get('$top'), '100');
});

test('rejects duplicate commit IDs, invalid pages and repeated continuation', async () => {
  const scm = { provider: 'ado', getPullRequestCommitPage: async () => ({ values: [{ commitId: sha }, { commitId: sha }], continuationToken: null }) };
  await assert.rejects(readAzurePrCommitPage({ scm, number: 7 }), /repeated/);
  await assert.rejects(readAzurePrCommitPage({ scm: { ...scm, getPullRequestCommitPage: async () => ({ values: [], continuationToken: 'same' }) }, number: 7, continuationToken: 'same' }), /continuation/);
  await assert.rejects(readAzurePrCommitPage({ scm: { ...scm, getPullRequestCommitPage: async () => ({ values: null, continuationToken: null }) }, number: 7 }), /page/);
});
