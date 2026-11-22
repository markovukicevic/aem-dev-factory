import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { saveTestEvidence, checkTestEvidence } from '../src/test-evidence.js';

async function setup(t, exitCode) {
  const root = await mkdtemp(join(tmpdir(), 'test-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd });
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd });
  const planPath = join(root, 'plan.md'), configPath = join(root, 'config.json'), outputPath = join(root, 'evidence.md');
  await writeFile(planPath, '---\nprovenance:\n  verified: false\n---\n### Step 1: Work\n**Status:** done\n');
  await writeFile(configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', `process.exit(${exitCode})`] } }));
  return { cwd, planPath, configPath, outputPath };
}

test('records actual passing test evidence without claiming overall verification', async t => {
  const options = await setup(t, 0);
  const result = await saveTestEvidence(options);
  const content = await readFile(options.outputPath, 'utf8');
  assert.equal(result.testPassed, true);
  assert.match(content, /"testPassed": true/);
  assert.match(content, /not complete/);
  assert.match(content, /does not verify the full implementation/);
  let invoked = false;
  await assert.rejects(saveTestEvidence(options, { inspect: async () => { invoked = true; } }), { code: 'EEXIST' });
  assert.equal(invoked, false);
  assert.equal(await readFile(options.outputPath, 'utf8'), content);
});

test('records a failing command instead of reporting a pass', async t => {
  const options = await setup(t, 3);
  const result = await saveTestEvidence(options);
  assert.equal(result.testPassed, false);
  assert.match(await readFile(options.outputPath, 'utf8'), /"exitCode": 3/);
});


test('compares recorded evidence to the current plan, configuration and Git state', async t => {
  const options = await setup(t, 0);
  await saveTestEvidence(options);
  const check = () => checkTestEvidence({ ...options, evidencePath: options.outputPath });
  assert.equal((await check()).consistent, true);
  await writeFile(options.planPath, '### Step 1: Changed\n**Status:** done\n');
  assert.equal((await check()).checks.planMatches, false);
  await writeFile(options.configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(1)'] } }));
  assert.equal((await check()).checks.configMatches, false);
  await writeFile(join(options.cwd, 'untracked.txt'), 'change');
  assert.equal((await check()).checks.workingTreeClean, false);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'new commit'], { cwd: options.cwd });
  assert.equal((await check()).checks.commitMatches, false);
});

test('rejects malformed or failed evidence without reporting a pass', async t => {
  const options = await setup(t, 3);
  await saveTestEvidence(options);
  const check = () => checkTestEvidence({ ...options, evidencePath: options.outputPath });
  assert.equal((await check()).checks.recordedPass, false);
  await writeFile(options.outputPath, '# Automated test evidence\n{}');
  await assert.rejects(check(), /format/);
});
