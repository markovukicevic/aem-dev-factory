import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPlanReadiness } from '../src/inspect-readiness.js';

test('reads a real plan and checks the actual Git branch and working tree', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-plan-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', repo]);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd: repo });
  const planPath = join(dir, 'implement.md');
  await writeFile(planPath, '---\nprovenance:\n  confidence: medium\n  verified: true\n---\n### Step 1: Test\n**Status:** done\n');
  const result = await inspectPlanReadiness({ cwd: repo, planPath, testsPassed: true, base: 'main' });
  assert.equal(result.ready, true);
  assert.equal(result.readiness.branch.head, 'feature');
  await writeFile(planPath, '### Step 1: Test\n**Status:** pending\n');
  assert.equal((await inspectPlanReadiness({ cwd: repo, planPath, testsPassed: true, base: 'main' })).ready, false);
});

test('rejects missing or malformed plan files', async () => {
  await assert.rejects(inspectPlanReadiness({ planPath: '' }), /planPath/);
  await assert.rejects(inspectPlanReadiness({ planPath: 'plan.md' }, { readPlan: async () => '### Step 1: Missing status' }), /malformed/);
});
