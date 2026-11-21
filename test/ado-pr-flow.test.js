import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoPullRequest } from '../src/ado-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', organization: 'org', project: 'project', repository: 'repo', token: 'token', title: 'Change', workItemIds: [12] };
const readiness = { steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main' } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ inspect: async () => good, refresh: async () => good, originReader: async () => ({ organization: 'org', project: 'project', repository: 'repo' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true }), makeClient: () => ({ listActivePullRequests: async () => [], createPullRequest: async () => ({ pullRequestId: 1 }) }) });

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
    { inspectDiff: async () => ({ hasCommits: false }) },
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
