import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoPullRequest } from '../src/ado-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', organization: 'org', project: 'project', repository: 'repo', token: 'token', title: 'Change', workItemIds: [12] };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ organization: 'org', project: 'project', repository: 'repo' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: 'b'.repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listActivePullRequests: async () => [], createPullRequest: async () => ({ pullRequestId: 1 }) }) });

test('creates an Azure PR only after checks and passes explicit work-item links', async () => {
  let calls = 0;
  const dependencies = { ...deps(), makeClient: () => ({ listActivePullRequests: async () => [], createPullRequest: async fields => { calls++; assert.deepEqual(fields.workItemIds, [12]); assert.equal(fields.head, 'feature'); return { pullRequestId: 1 }; } }) };
  assert.equal((await createAdoPullRequest(input, dependencies)).created, true);
  assert.equal(calls, 1);
});

test('blocks mismatched origins, unpublished branches, empty diffs and existing PRs', async () => {
  for (const override of [
    { originReader: async () => ({ organization: 'other', project: 'project', repository: 'repo' }) },
    { publishedReader: async () => ({ published: false }) },
    { inspectDiff: async () => ({ hasCommits: false, hasChanges: false }) },
    { inspectDiff: async () => ({ hasCommits: true, hasChanges: false }) },
    { makeClient: () => ({ listActivePullRequests: async () => [{ pullRequestId: 3 }] }) },
    { inspect: async () => ({ ready: false, blockers: ['tests failed'], warnings: [] }) },
  ]) assert.equal((await createAdoPullRequest(input, { ...deps(), ...override })).created, false);
});

test('does not create a PR when the published commit changes during checks', async () => {
  let reads = 0;
  assert.equal((await createAdoPullRequest(input, { ...deps(), publishedReader: async () => ({ published: true, commit: String(++reads) }) })).created, false);
});

test('rejects a published commit different from the tested commit', async () => {
  let writes = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: 'b'.repeat(40) }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createAdoPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tested commit/);
});

test('rejects an implementation plan changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createAdoPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /plan changed/);
});

test('rejects readiness configuration changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), readConfigDigest: async () => 'f'.repeat(64), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createAdoPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /configuration changed/);
});

test('refuses to write when the plan changes during duplicate lookup', async () => {
  let refreshes = 0;
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ++refreshes === 1 ? good : ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createAdoPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /changed before/);
});

test('refuses to write if the tracked base changes during remote lookup', async () => {
  let diffs = 0, writes = 0;
  const dependencies = { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: (++diffs === 1 ? 'b' : 'c').repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createAdoPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tracked base changed/);
});
