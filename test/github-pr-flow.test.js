import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubPullRequest } from '../src/github-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', owner: 'team', repository: 'site', token: 'token', title: 'Example' };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ owner: 'team', repository: 'site' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: 'b'.repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => ({ number: 1 }) }) });

test('creates only after checks and repository identity succeed', async () => {
  let calls = 0;
  const dependencies = { ...deps(), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async fields => { calls++; assert.equal(fields.head, 'feature'); return { number: 1 }; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, true);
  assert.equal(calls, 1);
});

test('does not create a PR for a different origin, unpublished branch, or failed readiness', async () => {
  for (const override of [
    { originReader: async () => ({ owner: 'other', repository: 'site' }) },
    { publishedReader: async () => ({ published: false }) },
    { inspect: async () => ({ ready: false, blockers: ['tests failed'], warnings: [] }) },
    { refresh: async () => ({ ...good, readiness: { ...readiness, branch: { head: 'other', base: 'main' } } }) },
  ]) {
    let calls = 0;
    const result = await createGitHubPullRequest(input, { ...deps(), ...override, makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { calls++; } }) });
    assert.equal(result.created, false);
    assert.equal(calls, 0);
  }
});

test('does not create a PR when the branch changes during checks', async () => {
  let reads = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: `${++reads}` }) };
  assert.equal((await createGitHubPullRequest(input, dependencies)).created, false);
});

test('integrates readiness and published branch checks against a real local Git origin', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-pr-flow-'));
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
  const dependencies = { originReader: async () => ({ owner: 'team', repository: 'site' }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { creates++; return { number: 1 }; } }) };
  const options = { ...input, cwd, configPath, planPath };
  assert.equal((await createGitHubPullRequest(options, dependencies)).created, true);
  commit();
  assert.equal((await createGitHubPullRequest(options, dependencies)).created, false);
  assert.equal(creates, 1);
});


test('does not create duplicate or empty pull requests', async () => {
  let creates = 0;
  const client = { listOpenPullRequests: async () => [{ number: 42, html_url: 'https://github.com/team/site/pull/42' }], createPullRequest: async () => { creates++; } };
  const duplicate = await createGitHubPullRequest(input, { ...deps(), makeClient: () => client });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.existingPullRequests[0].number, 42);
  const empty = await createGitHubPullRequest(input, { ...deps(), inspectDiff: async () => ({ hasCommits: false }), makeClient: () => client });
  assert.equal(empty.created, false);
  const emptyCommit = await createGitHubPullRequest(input, { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: false }), makeClient: () => client });
  assert.equal(emptyCommit.created, false);
  assert.equal(creates, 0);
});

test('rejects a published commit different from the tested commit', async () => {
  let writes = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: 'b'.repeat(40) }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tested commit/);
});

test('rejects an implementation plan changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /plan changed/);
});

test('rejects readiness configuration changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), readConfigDigest: async () => 'f'.repeat(64), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /configuration changed/);
});

test('refuses to write when the plan changes during duplicate lookup', async () => {
  let refreshes = 0;
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ++refreshes === 1 ? good : ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /changed before/);
});

test('refuses to write if the tracked base changes during remote lookup', async () => {
  let diffs = 0, writes = 0;
  const dependencies = { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: (++diffs === 1 ? 'b' : 'c').repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tracked base changed/);
});
