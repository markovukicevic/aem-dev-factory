import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readGitState } from '../src/git-state.js';

test('detects the actual branch and untracked changes in a temporary repository', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'devflow-git-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', '-b', 'feature'], { cwd: directory });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd: directory });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  assert.deepEqual(await readGitState(directory), { head: 'feature', commit, workingTreeClean: true });
  await writeFile(join(directory, 'new file.txt'), 'hello');
  assert.deepEqual(await readGitState(directory), { head: 'feature', commit, workingTreeClean: false });
});

test('fails when the directory is not a Git repository', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'devflow-not-git-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(readGitState(directory));
});
