import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPublishedBranch } from '../src/published-branch.js';

test('checks an actual bare origin for missing, matching and stale branches', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-published-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const cwd = join(dir, 'repo');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const commit = () => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'test']);
  git(['remote', 'add', 'origin', remote]);
  commit();
  assert.deepEqual(await inspectPublishedBranch({ cwd, head: 'feature' }), { published: false, reason: 'missing-remote-branch' });
  git(['push', '-q', 'origin', 'feature']);
  assert.equal((await inspectPublishedBranch({ cwd, head: 'feature' })).published, true);
  commit();
  assert.deepEqual(await inspectPublishedBranch({ cwd, head: 'feature' }), { published: false, reason: 'remote-branch-differs' });
});

test('rejects malformed remote output rather than assuming a match', async () => {
  const run = async (_command, args) => args[0] === 'rev-parse' ? { stdout: `${'a'.repeat(40)}\n` } : args[0] === 'ls-remote' ? { stdout: `${'a'.repeat(40)}\trefs/heads/other\n` } : { stdout: '' };
  await assert.rejects(inspectPublishedBranch({ cwd: '/repo', head: 'feature' }, { run }), /Invalid remote/);
});
