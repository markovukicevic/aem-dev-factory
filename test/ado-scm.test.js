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
