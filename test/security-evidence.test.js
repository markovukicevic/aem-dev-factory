import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { saveSecurityEvidence } from '../src/security-evidence.js';

test('records local and history findings without exposing matched values', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'security-evidence-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git(['init', '-q', '-b', 'feature']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial']);
  const base = git(['rev-parse', 'HEAD']).trim(), token = 'ghp_' + 'D'.repeat(36);
  await writeFile(join(cwd, 'secret.txt'), token);
  git(['add', 'secret.txt']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'change']);
  const outputPath = join(cwd, 'evidence.md');
  const result = await saveSecurityEvidence({ cwd, base, outputPath });
  assert.equal(result.complete, true);
  assert.ok(result.findingCount > 0);
  const report = await readFile(outputPath, 'utf8');
  assert.match(report, /github-token-pattern/);
  assert.ok(!report.includes(token));
  await assert.rejects(saveSecurityEvidence({ cwd, base, outputPath }), { code: 'EEXIST' });
  assert.equal(await readFile(outputPath, 'utf8'), report);
});

test('marks changed Git state as incomplete without claiming security', async t => {
  const root = await mkdtemp(join(tmpdir(), 'security-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0;
  const scan = { findings: [], skipped: [], complete: true };
  const result = await saveSecurityEvidence({ cwd: root, base: 'a'.repeat(40), outputPath: join(root, 'evidence.md') }, { readGit: async () => ({ head: 'feature', commit: (++calls === 1 ? 'b' : 'c').repeat(40), workingTreeClean: true }), scanWorktree: async () => scan, scanHistory: async () => ({ ...scan, base: 'a'.repeat(40), head: 'b'.repeat(40) }) });
  assert.equal(result.complete, false);
  assert.match(result.scope, /does not establish security/);
});
