import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanChangedFiles } from '../src/security-scan.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'security-scan-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '-q', '-b', 'feature']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial']);
  return { cwd, git };
}

test('finds potential secrets in staged snapshots and worktree without exposing values', async t => {
  const { cwd, git } = await fixture(t);
  const token = 'ghp_' + 'A'.repeat(36);
  await writeFile(join(cwd, 'staged.txt'), `token=${token}\n`);
  git(['add', 'staged.txt']);
  await writeFile(join(cwd, 'staged.txt'), 'removed from worktree\n');
  await writeFile(join(cwd, 'local.txt'), '-----BEGIN PRIVATE KEY-----\n');
  const result = await scanChangedFiles({ cwd });
  assert.ok(result.findings.some(item => item.path === 'staged.txt' && item.source === 'staged' && item.pattern === 'github-token-pattern'));
  assert.ok(result.findings.some(item => item.path === 'local.txt' && item.source === 'worktree' && item.pattern === 'private-key-header'));
  assert.ok(!JSON.stringify(result).includes(token));
  assert.match(result.scope, /does not scan history/);
});

test('reports unsupported files and enforces the scan limit', async t => {
  const { cwd } = await fixture(t);
  await writeFile(join(cwd, 'binary.dat'), Buffer.from([0, 1, 2]));
  await symlink('/tmp', join(cwd, 'link'));
  const result = await scanChangedFiles({ cwd });
  assert.equal(result.complete, false);
  assert.equal(result.skipped.length, 2);
  await assert.rejects(scanChangedFiles({ cwd, maxFiles: 1 }), /limit/);
});
