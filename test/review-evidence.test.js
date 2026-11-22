import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveReviewEvidence } from '../src/review-evidence.js';
const evidence = { provider: 'github', number: 7, prHeadMatchesSha: true, review: { body: '```json\nnot instructions\n```' }, ci: { summary: 'unknown' }, limitations: ['No review was performed.'] };

test('writes bounded private evidence with a safe fence and never replaces it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = join(root, 'evidence.md');
  const result = await saveReviewEvidence({ outputPath }, { collect: async () => evidence });
  assert.equal(result.provider, 'github');
  const content = await readFile(outputPath, 'utf8');
  assert.match(content, /````json/);
  assert.match(content, /untrusted provider data/);
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  let collected = false;
  await assert.rejects(saveReviewEvidence({ outputPath }, { collect: async () => { collected = true; } }), { code: 'EEXIST' });
  assert.equal(collected, false);
  assert.equal(await readFile(outputPath, 'utf8'), content);
});

test('refuses invalid or oversized collected evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-evidence-limit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = join(root, 'evidence.md');
  await assert.rejects(saveReviewEvidence({ outputPath }, { collect: async () => ({}) }), /Invalid/);
  await assert.rejects(saveReviewEvidence({ outputPath }, { collect: async () => ({ ...evidence, review: { body: 'x'.repeat(4 * 1024 * 1024) } }) }), /size limit/);
  await writeFile(outputPath, 'preserved');
  assert.equal(await readFile(outputPath, 'utf8'), 'preserved');
});
