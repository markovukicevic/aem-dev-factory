import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveBaseBranch } from '../src/base-branch.js';

test('resolves an explicitly configured branch and rejects invalid names', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-base-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', cwd]);
  assert.equal(await resolveBaseBranch({ cwd, configuredBase: 'release/next' }), 'release/next');
  await assert.rejects(resolveBaseBranch({ cwd, configuredBase: '../bad' }), /Invalid base/);
  await assert.rejects(resolveBaseBranch({ cwd, configuredBase: '' }), /invalid/);
});

test('uses a valid local origin HEAD without network access', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-head-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '-q', '-b', 'main']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  assert.equal(await resolveBaseBranch({ cwd }), 'main');
  git(['update-ref', '-d', 'refs/remotes/origin/main']);
  await assert.rejects(resolveBaseBranch({ cwd }), /missing/);
});

test('does not guess when no origin default branch exists', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-no-head-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', cwd]);
  await assert.rejects(resolveBaseBranch({ cwd }), /configure a base branch/);
});
