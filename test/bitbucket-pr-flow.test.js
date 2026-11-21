import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBitbucketOrigin } from '../src/bitbucket-origin.js';
import { createBitbucketPullRequest } from '../src/bitbucket-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', workspace: 'team', repository: 'site', token: 'token', title: 'Change' };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ workspace: 'team', repository: 'site' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => ({ id: 1 }) }) });

test('recognizes only standard Bitbucket Cloud origins', () => {
  for (const remote of ['https://bitbucket.org/team/site.git', 'git@bitbucket.org:team/site.git', 'ssh://git@bitbucket.org/team/site']) assert.deepEqual(parseBitbucketOrigin(remote), { workspace: 'team', repository: 'site' });
  for (const remote of ['https://evil.example/team/site', 'https://token@bitbucket.org/team/site', 'git@bitbucket.org:team/site/extra']) assert.throws(() => parseBitbucketOrigin(remote));
});

test('creates a PR after all checks pass', async () => {
  let calls = 0;
  const dependencies = { ...deps(), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async fields => { calls++; assert.equal(fields.head, 'feature'); return { id: 1 }; } }) };
  assert.equal((await createBitbucketPullRequest(input, dependencies)).created, true);
  assert.equal(calls, 1);
});

test('blocks mismatched origins, unpublished branches, empty diffs and duplicate PRs', async () => {
  for (const override of [
    { originReader: async () => ({ workspace: 'other', repository: 'site' }) },
    { publishedReader: async () => ({ published: false }) },
    { inspectDiff: async () => ({ hasCommits: false, hasChanges: false }) },
    { inspectDiff: async () => ({ hasCommits: true, hasChanges: false }) },
    { makeClient: () => ({ listOpenPullRequests: async () => [{ id: 3 }] }) },
    { inspect: async () => ({ ready: false, blockers: ['tests failed'], warnings: [] }) },
  ]) assert.equal((await createBitbucketPullRequest(input, { ...deps(), ...override })).created, false);
});

test('stops if the published commit changes during checks', async () => {
  let reads = 0;
  assert.equal((await createBitbucketPullRequest(input, { ...deps(), publishedReader: async () => ({ published: true, commit: String(++reads) }) })).created, false);
});

test('checks a real local origin and blocks an unpublished newer commit', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-bitbucket-pr-'));
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
  const dependencies = { originReader: async () => ({ workspace: 'team', repository: 'site' }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { creates++; return { id: 1 }; } }) };
  const options = { ...input, cwd, configPath, planPath };
  assert.equal((await createBitbucketPullRequest(options, dependencies)).created, true);
  commit();
  assert.equal((await createBitbucketPullRequest(options, dependencies)).created, false);
  assert.equal(creates, 1);
});

test('rejects a published commit different from the tested commit', async () => {
  let writes = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: 'b'.repeat(40) }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createBitbucketPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tested commit/);
});

test('rejects an implementation plan changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createBitbucketPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /plan changed/);
});

test('rejects readiness configuration changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), readConfigDigest: async () => 'f'.repeat(64), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createBitbucketPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /configuration changed/);
});
