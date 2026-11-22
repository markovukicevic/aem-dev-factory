import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLabOrigin } from '../src/gitlab-origin.js';
import { createGitLabMergeRequest } from '../src/gitlab-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', project: 'team/sub/site', token: 'token', title: 'Change' };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ project: 'team/sub/site' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: 'b'.repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => ({ iid: 1 }) }) });

test('parses only standard GitLab.com origins', () => {
  for (const remote of ['https://gitlab.com/team/sub/site.git', 'git@gitlab.com:team/sub/site.git', 'ssh://git@gitlab.com/team/sub/site']) assert.deepEqual(parseGitLabOrigin(remote), { project: 'team/sub/site' });
  for (const remote of ['https://evil.example/team/site', 'https://token@gitlab.com/team/site', 'git@gitlab.com:team/../site']) assert.throws(() => parseGitLabOrigin(remote));
});

test('creates an MR only when readiness and remote checks pass', async () => {
  let calls = 0;
  const dependencies = { ...deps(), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async fields => { calls++; assert.equal(fields.head, 'feature'); return { iid: 1 }; } }) };
  assert.equal((await createGitLabMergeRequest(input, dependencies)).created, true);
  assert.equal(calls, 1);
});

test('blocks mismatched origins, unpublished branches, empty diffs and duplicate MRs', async () => {
  for (const override of [
    { originReader: async () => ({ project: 'other/site' }) },
    { publishedReader: async () => ({ published: false }) },
    { inspectDiff: async () => ({ hasCommits: false, hasChanges: false }) },
    { inspectDiff: async () => ({ hasCommits: true, hasChanges: false }) },
    { makeClient: () => ({ listOpenPullRequests: async () => [{ iid: 3 }] }) },
    { inspect: async () => ({ ready: false, blockers: ['tests failed'], warnings: [] }) },
  ]) assert.equal((await createGitLabMergeRequest(input, { ...deps(), ...override })).created, false);
});

test('blocks a branch that changes during checks', async () => {
  let reads = 0;
  assert.equal((await createGitLabMergeRequest(input, { ...deps(), publishedReader: async () => ({ published: true, commit: String(++reads) }) })).created, false);
});

test('rejects a published commit different from the tested commit', async () => {
  let writes = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: 'b'.repeat(40) }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitLabMergeRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tested commit/);
});

test('rejects an implementation plan changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitLabMergeRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /plan changed/);
});

test('rejects readiness configuration changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), readConfigDigest: async () => 'f'.repeat(64), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitLabMergeRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /configuration changed/);
});

test('refuses to write when the plan changes during duplicate lookup', async () => {
  let refreshes = 0;
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ++refreshes === 1 ? good : ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitLabMergeRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /changed before/);
});

test('refuses to write if the tracked base changes during remote lookup', async () => {
  let diffs = 0, writes = 0;
  const dependencies = { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: (++diffs === 1 ? 'b' : 'c').repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitLabMergeRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tracked base changed/);
});
