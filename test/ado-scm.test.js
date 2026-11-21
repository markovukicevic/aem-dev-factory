import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoScm } from '../src/ado-scm.js';
import { createScmProvider } from '../src/providers.js';

test('reads PR and threads from a fixed Azure DevOps API endpoint', async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ id: 3 }) }; };
  const scm = createScmProvider({ provider: 'ado', organization: 'org', project: 'My Project', repository: 'my-repo' }, { adoToken: 'secret', fetchImpl });
  await scm.getPullRequest(3);
  await scm.getPullRequestThreads(3);
  assert.match(calls[0][0], /^https:\/\/dev\.azure\.com\/org\/My%20Project\/_apis\/git\/repositories\/my-repo\/pullrequests\/3\?api-version=7.1$/);
  assert.match(calls[1][0], /\/3\/threads\?api-version=7.1$/);
  assert.equal(calls[0][1].redirect, 'error');
});

test('creates a PR with explicit refs, draft flag and linked Azure work items', async () => {
  let call;
  const scm = createAdoScm({ organization: 'org', project: 'p', repository: 'r', token: 'secret', fetchImpl: async (...args) => { call = args; return { ok: true, json: async () => ({ pullRequestId: 7 }) }; } });
  assert.equal((await scm.createPullRequest({ title: 'Change', head: 'feature/123', base: 'develop', body: 'Summary', draft: true, workItemIds: [123] })).pullRequestId, 7);
  assert.equal(call[1].method, 'POST');
  assert.deepEqual(JSON.parse(call[1].body), { title: 'Change', description: 'Summary', sourceRefName: 'refs/heads/feature/123', targetRefName: 'refs/heads/develop', isDraft: true, workItemRefs: [{ id: '123' }] });
});

test('rejects invalid branch names, IDs and same-branch PRs before a request', () => {
  let calls = 0;
  const scm = createAdoScm({ organization: 'org', project: 'p', repository: 'r', token: 'secret', fetchImpl: async () => { calls++; } });
  for (const head of ['../main', 'feature x', 'refs//test', '-evil', 'a.lock', 'a~b']) assert.throws(() => scm.createPullRequest({ title: 'x', head, base: 'main' }));
  assert.throws(() => scm.createPullRequest({ title: 'x', head: 'main', base: 'main' }));
  assert.throws(() => scm.getPullRequest(0));
  assert.equal(calls, 0);
});

test('checks for active pull requests matching source and target', async () => {
  let url;
  const scm = createAdoScm({ organization: 'org', project: 'p', repository: 'r', token: 'secret', fetchImpl: async value => { url = value; return { ok: true, json: async () => ({ value: [{ pullRequestId: 7 }] }) }; } });
  assert.equal((await scm.listActivePullRequests({ head: 'feature/123', base: 'main' }))[0].pullRequestId, 7);
  const query = new URL(url).searchParams;
  assert.equal(query.get('searchCriteria.status'), 'active');
  assert.equal(query.get('searchCriteria.sourceRefName'), 'refs/heads/feature/123');
  assert.equal(query.get('searchCriteria.targetRefName'), 'refs/heads/main');
});

test('reads bounded Azure PR iteration change pages and rejects invalid continuation', async () => {
  const urls = [];
  const scm = createAdoScm({ organization: 'org', project: 'project', repository: 'site', token: 'secret', fetchImpl: async url => {
    urls.push(url);
    const skip = new URL(url).searchParams.get('$skip');
    return { ok: true, json: async () => skip === '0' ? { changeEntries: [{ id: 1 }], nextSkip: 1, nextTop: 100 } : { changeEntries: [{ id: 2 }], nextSkip: 0, nextTop: 0 } };
  } });
  const result = await scm.getIterationChanges(7, 3);
  assert.deepEqual(result.changes.map(item => item.id), [1, 2]);
  assert.equal(result.complete, true);
  assert.match(urls[0], /pullrequests\/7\/iterations\/3\/changes\?/);
  assert.equal((await scm.getIterationChanges(7, 3, { maxPages: 1 })).complete, false);
  await assert.rejects(scm.getIterationChanges(7, 0));
  const invalid = createAdoScm({ organization: 'org', project: 'project', repository: 'site', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ changeEntries: [], nextSkip: 0, nextTop: 100 }) }) });
  await assert.rejects(invalid.getIterationChanges(7, 3), /continuation/);
});


test('accepts Azure responses that omit zero continuation fields', async () => {
  const scm = createAdoScm({ organization: 'org', project: 'project', repository: 'site', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ changeEntries: [{ item: { path: '/example' } }] }) }) });
  assert.equal((await scm.getIterationChanges(7, 3)).complete, true);
});
