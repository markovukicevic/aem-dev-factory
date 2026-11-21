import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizePlanStatus } from '../src/plan-status.js';
import { transitionPlanFile, transitionPlanText } from '../src/plan-transition.js';
const plan = '---\nprovenance:\n  verified: true\n---\n# Plan\n### Step 1: Work\n**Status:** pending\n### Step 2: Check\n**Status:** pending\n';

test('transitions a single step, invalidates verification and preserves other text', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plan-transition-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'implement.md');
  await writeFile(path, plan, { mode: 0o640 });
  const result = await transitionPlanFile({ path, step: 1, from: 'pending', to: 'in-progress', expectedDigest: summarizePlanStatus(plan).digest });
  const updated = await readFile(path, 'utf8');
  assert.match(updated, /verified: false/);
  assert.match(updated, /Step 1: Work\n\*\*Status:\*\* in-progress/);
  assert.match(updated, /Step 2: Check\n\*\*Status:\*\* pending/);
  assert.equal(result.digest, summarizePlanStatus(updated).digest);
  assert.equal((await stat(path)).mode & 0o777, 0o640);
  await assert.rejects(transitionPlanFile({ path, step: 1, from: 'pending', to: 'in-progress', expectedDigest: summarizePlanStatus(plan).digest }), /changed/);
  assert.equal(await readFile(path, 'utf8'), updated);
});

test('rejects unsupported edits, stale statuses and steps out of order', () => {
  assert.throws(() => transitionPlanText({ text: plan, step: 2, from: 'pending', to: 'in-progress' }), /earlier/);
  assert.throws(() => transitionPlanText({ text: plan, step: 1, from: 'pending', to: 'done' }), /transition/);
  assert.throws(() => transitionPlanText({ text: `<!-- note -->\n${plan}`, step: 1, from: 'pending', to: 'in-progress' }), /comments/);
  const withExample = `${plan}\n\`\`\`\n### Step 1: Example\n**Status:** pending\n\`\`\`\n`;
  const updated = transitionPlanText({ text: withExample, step: 1, from: 'pending', to: 'in-progress' });
  assert.match(updated, /Example\n\*\*Status:\*\* pending/);
});

test('refuses symlinked plans and existing locks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plan-transition-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = join(root, 'original.md'), link = join(root, 'link.md');
  await writeFile(original, plan);
  await symlink(original, link);
  await assert.rejects(transitionPlanFile({ path: link, step: 1, from: 'pending', to: 'in-progress', expectedDigest: summarizePlanStatus(plan).digest }), /regular file/);
  await writeFile(`${original}.lock`, 'owned');
  await assert.rejects(transitionPlanFile({ path: original, step: 1, from: 'pending', to: 'in-progress', expectedDigest: summarizePlanStatus(plan).digest }), { code: 'EEXIST' });
  assert.equal(await readFile(original, 'utf8'), plan);
});

test('supports the documented blocked and retry lifecycle without claiming verification', () => {
  const active = transitionPlanText({ text: plan, step: 1, from: 'pending', to: 'in-progress' });
  const blocked = transitionPlanText({ text: active, step: 1, from: 'in-progress', to: 'blocked' });
  const retry = transitionPlanText({ text: blocked, step: 1, from: 'blocked', to: 'pending' });
  const resumed = transitionPlanText({ text: retry, step: 1, from: 'pending', to: 'in-progress' });
  const done = transitionPlanText({ text: resumed, step: 1, from: 'in-progress', to: 'done' });
  assert.equal(summarizePlanStatus(done).next.number, 2);
  assert.equal(summarizePlanStatus(done).provenance.verified, false);
});
