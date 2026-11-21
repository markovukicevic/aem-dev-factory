import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoPullRequest } from '../src/ado-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', organization: 'org', project: 'project', repository: 'repo', token: 'token', title: 'Change', workItemIds: [12] };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ organization: 'org', project: 'project', repository: 'repo' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true }), makeClient: () => ({ listActivePullRequests: async () => [], createPullRequest: async () => ({ pullRequestId: 1 }) }) });

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

test('runs readiness and published-branch checks against a real local Git origin', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-ado-pr-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const cwd = join(dir, 'repo');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const commit = () => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'test']);
  commit();
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', 'origin', 'HEAD:refs/heads/main']);
  await writeFile(join(cwd, 'feature.txt'), 'feature content');
  git(['add', 'feature.txt']);
  commit();
  git(['push', '-q', 'origin', 'HEAD:refs/heads/feature']);
  git(['fetch', '-q', 'origin']);
  const configPath = join(dir, 'config.json');
  const planPath = join(dir, 'implement.md');
  await writeFile(configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }));
  await writeFile(planPath, '### Step 1: Work\n**Status:** done\n');
  let creates = 0;
  const dependencies = { originReader: async () => ({ organization: 'org', project: 'project', repository: 'repo' }), makeClient: () => ({ listActivePullRequests: async () => [], createPullRequest: async () => { creates++; return { pullRequestId: 1 }; } }) };
  const options = { ...input, cwd, configPath, planPath };
  assert.equal((await createAdoPullRequest(options, dependencies)).created, true);
  commit();
  assert.equal((await createAdoPullRequest(options, dependencies)).created, false);
  assert.equal(creates, 1);
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
