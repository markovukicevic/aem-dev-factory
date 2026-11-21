import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLabOrigin } from '../src/gitlab-origin.js';
import { createGitLabMergeRequest } from '../src/gitlab-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', project: 'team/sub/site', token: 'token', title: 'Change' };
const readiness = { steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main' } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ inspect: async () => good, refresh: async () => good, originReader: async () => ({ project: 'team/sub/site' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => ({ iid: 1 }) }) });

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

test('uses real local Git evidence and blocks an unpublished newer commit', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-gitlab-mr-'));
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
  const dependencies = { originReader: async () => ({ project: 'team/sub/site' }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { creates++; return { iid: 1 }; } }) };
  const options = { ...input, cwd, configPath, planPath };
  assert.equal((await createGitLabMergeRequest(options, dependencies)).created, true);
  commit();
  assert.equal((await createGitLabMergeRequest(options, dependencies)).created, false);
  assert.equal(creates, 1);
});
