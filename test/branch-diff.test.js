import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectBranchDiff } from '../src/branch-diff.js';

test('detects whether actual HEAD has commits beyond the tracked base', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-diff-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '-q', '-b', 'feature']);
  const commit = () => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'test']);
  commit();
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.deepEqual(await inspectBranchDiff({ cwd, base: 'main' }), { hasCommits: false, count: 0 });
  commit();
  assert.deepEqual(await inspectBranchDiff({ cwd, base: 'main' }), { hasCommits: true, count: 1 });
  await assert.rejects(inspectBranchDiff({ cwd, base: 'missing' }), /common ancestor/);
});
