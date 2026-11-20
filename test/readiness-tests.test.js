import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPlanWithTests } from '../src/inspect-readiness.js';

const done = '### Step 1: Implement\n**Status:** done\n';

test('runs real tests before checking branch and plan readiness', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-run-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', repo]);
  const planPath = join(dir, 'implement.md');
  await writeFile(planPath, done);
  const options = { cwd: repo, planPath, base: 'main', testCommand: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } };
  assert.equal((await inspectPlanWithTests(options)).ready, true);
  options.testCommand.args = ['-e', 'process.exit(2)'];
  const failure = await inspectPlanWithTests(options);
  assert.equal(failure.ready, false);
  assert.equal(failure.testResult.exitCode, 2);
});

test('reloads the plan after tests, and rejects malformed plans before running tests', async () => {
  let reads = 0;
  let runs = 0;
  const deps = { readPlan: async () => ++reads === 1 ? done : done.replace('done', 'pending'), runTests: async () => { runs++; return { passed: true }; }, readGit: async () => ({ head: 'feature', workingTreeClean: true }) };
  const result = await inspectPlanWithTests({ cwd: '/repo', planPath: 'plan.md', base: 'main', testCommand: {} }, deps);
  assert.equal(result.ready, false);
  assert.equal(runs, 1);
  assert.equal(reads, 2);
  await assert.rejects(inspectPlanWithTests({ cwd: '/repo', planPath: 'plan.md' }, { ...deps, readPlan: async () => 'invalid' }));
  assert.equal(runs, 1);
});
