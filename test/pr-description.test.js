import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPullRequestDescription, extractSection, savePullRequestDescription } from '../src/pr-description.js';

const plan = '# Plan\n## Steps\n### Step 1: Change hero\n**Status:** done\n### Step 2: Add tests\n**Status:** done\n';

test('generates a PR description from source sections and actual verification evidence', () => {
  const text = buildPullRequestDescription({ sharePlan: '## Summary\nAdd a hero\n\n## Changes\n- Update dialog\n', plan, verification: '- npm test: passed' });
  assert.match(text, /Add a hero/);
  assert.match(text, /Update dialog/);
  assert.match(text, /npm test: passed/);
});

test('falls back to explanation and completed plan step titles without inventing verification', () => {
  const text = buildPullRequestDescription({ explanation: '## What & Why\nAdd a feature\n', plan, verification: 'Manual review pending' });
  assert.match(text, /Add a feature/);
  assert.match(text, /- Change hero/);
  assert.match(text, /Manual review pending/);
  assert.throws(() => buildPullRequestDescription({ explanation: '## What & Why\nFeature', plan: plan.replace('done', 'pending'), verification: 'test passed' }));
  assert.throws(() => buildPullRequestDescription({ explanation: '## What & Why\nFeature', plan, verification: '' }));
});

test('does not mistake a fenced example or comment for a real section', () => {
  assert.equal(extractSection('```md\n## Summary\nFake\n```\n<!--\n## Summary\nFake\n-->\n## Summary\nReal\n', ['Summary']), 'Real');
});

test('creates a new description file without overwriting user work', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-pr-description-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const explanationPath = join(dir, 'explain.md');
  const planPath = join(dir, 'implement.md');
  const verificationPath = join(dir, 'verification.md');
  const outputPath = join(dir, 'pr.md');
  await writeFile(explanationPath, '## Summary\nA feature\n');
  await writeFile(planPath, plan);
  await writeFile(verificationPath, 'Tests passed');
  const options = { explanationPath, planPath, verificationPath, outputPath };
  await savePullRequestDescription(options);
  assert.match(await readFile(outputPath, 'utf8'), /Tests passed/);
  await assert.rejects(savePullRequestDescription(options), { code: 'EEXIST' });
});
