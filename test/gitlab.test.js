import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitLabClient } from '../src/gitlab.js';

const issue = { iid: 7, title: 'Bug', description: 'Details', state: 'opened', labels: ['bug'], author: { username: 'alex' } };

test('reads GitLab issues and paginated notes while filtering system activity', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    assert.equal(options.headers['PRIVATE-TOKEN'], 'secret');
    assert.equal(options.redirect, 'error');
    if (!url.includes('/notes?')) return { ok: true, json: async () => issue };
    const first = new URL(url).searchParams.get('page') === '1';
    return { ok: true, headers: { get: () => first ? '2' : '' }, json: async () => first ? [{ id: 1, body: 'Comment', system: false }, { id: 2, body: 'changed status', system: true }] : [{ id: 3, body: 'Second', system: false }] };
  };
  const client = createGitLabClient({ project: 'team/subgroup/site', token: 'secret', fetchImpl });
  const result = await client.getTicket(7);
  assert.deepEqual(result.comments.map(comment => comment.body), ['Comment', 'Second']);
  assert.match(urls[0], /projects\/team%2Fsubgroup%2Fsite\/issues\/7$/);
});

test('reads merge requests and pipeline details', async () => {
  const urls = [];
  const client = createGitLabClient({ project: 'team/site', token: 'secret', fetchImpl: async url => { urls.push(url); return { ok: true, headers: { get: () => null }, json: async () => url.includes('/pipelines?') ? [] : { id: 5 } }; } });
  assert.equal((await client.getPullRequest(5)).id, 5);
  assert.equal((await client.getPipeline(5)).id, 5);
  assert.deepEqual((await client.listPipelines({ sha: '123abcd' })).values, []);
  assert.match(urls[2], /sha=123abcd/);
});

test('rejects invalid project paths, repeated pagination and incomplete results', async () => {
  for (const project of ['../site', 'https://evil/site', 'team/../../site', 'site']) assert.throws(() => createGitLabClient({ project, token: 'secret' }));
  const client = createGitLabClient({ project: 'team/site', token: 'secret', maxPages: 1, fetchImpl: async url => ({ ok: true, headers: { get: () => '2' }, json: async () => url.includes('/notes?') ? [{ id: 1, body: 'x' }] : issue }) });
  await assert.rejects(client.getTicket(7), /incomplete/);
  await assert.rejects(client.getPullRequest(0));
});

test('lists matching open MRs and creates a draft with explicit source and target', async () => {
  const calls = [];
  const client = createGitLabClient({ project: 'team/site', token: 'secret', fetchImpl: async (...args) => { calls.push(args); return { ok: true, headers: { get: () => null }, json: async () => args[1].method === 'POST' ? { iid: 9 } : [] }; } });
  assert.deepEqual(await client.listOpenPullRequests({ head: 'feature/123', base: 'main' }), []);
  const query = new URL(calls[0][0]).searchParams;
  assert.equal(query.get('source_branch'), 'feature/123');
  assert.equal(query.get('target_branch'), 'main');
  assert.equal(query.get('scope'), 'all');
  assert.equal((await client.createPullRequest({ title: 'Change', head: 'feature/123', base: 'main', body: 'Summary', draft: true })).iid, 9);
  assert.deepEqual(JSON.parse(calls[1][1].body), { title: 'Draft: Change', source_branch: 'feature/123', target_branch: 'main', description: 'Summary', remove_source_branch: false });
  await assert.rejects(client.createPullRequest({ title: 'Draft: Change', head: 'feature', base: 'main', draft: false }));
});
