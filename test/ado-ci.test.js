import test from 'node:test';
import assert from 'node:assert/strict';
import { createCiProvider } from '../src/providers.js';

test('reads Azure builds with a branch and explicit continuation token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options]); return { ok: true, headers: { get: () => 'next+token' }, json: async () => url.includes('/builds?') ? { value: [{ id: 1, sourceVersion: 'abc' }] } : { id: 7 } }; };
  const ci = createCiProvider({ provider: 'ado-pipelines', organization: 'org', project: 'My Project' }, { adoToken: 'secret', fetchImpl });
  const page = await ci.listBuilds({ branch: 'feature/a', continuationToken: 'old+token' });
  const query = new URL(calls[0][0]).searchParams;
  assert.equal(query.get('branchName'), 'refs/heads/feature/a');
  assert.equal(query.get('continuationToken'), 'old+token');
  assert.equal(page.continuationToken, 'next+token');
  assert.equal((await ci.getBuild(7)).id, 7);
  assert.equal(calls[0][1].redirect, 'error');
});

test('rejects invalid requests and malformed server results', async () => {
  const ci = createCiProvider({ provider: 'ado-pipelines', organization: 'org', project: 'p' }, { adoToken: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ value: null }) }) });
  await assert.rejects(ci.listBuilds({ branch: '../bad' }));
  await assert.rejects(ci.listBuilds({ branch: 'main' }), /Invalid Azure builds/);
  assert.throws(() => ci.getBuild(0));
});
