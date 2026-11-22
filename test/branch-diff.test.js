import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  let result = await inspectBranchDiff({ cwd, base: 'main' });
  assert.deepEqual([result.hasCommits, result.hasChanges, result.count], [false, false, 0]);
  assert.equal(result.baseCommit, result.headCommit);
  commit();
  result = await inspectBranchDiff({ cwd, base: 'main' });
  assert.deepEqual([result.hasCommits, result.hasChanges, result.count], [true, false, 1]);
  assert.notEqual(result.baseCommit, result.headCommit);
  await writeFile(join(cwd, 'file.txt'), 'new content');
  git(['add', 'file.txt']);
  commit();
  result = await inspectBranchDiff({ cwd, base: 'main' });
  assert.deepEqual([result.hasCommits, result.hasChanges, result.count], [true, true, 2]);
  await assert.rejects(inspectBranchDiff({ cwd, base: 'missing' }), /common ancestor/);
});

test('rejects a base reference changed during diff inspection', async () => {
  let baseReads = 0;
  const run = async (_command, args) => {
    if (args[0] === 'rev-parse') return { stdout: args[2].startsWith('refs/remotes/') ? (++baseReads === 1 ? 'b' : 'c').repeat(40) : 'a'.repeat(40) };
    if (args[0] === 'rev-list') return { stdout: '1\n' };
    if (args[0] === 'diff') throw Object.assign(new Error('changed'), { code: 1 });
    return { stdout: '' };
  };
  await assert.rejects(inspectBranchDiff({ cwd: '/repo', base: 'main' }, { run }), /references changed/);
});
