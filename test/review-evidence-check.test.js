import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveReviewEvidence } from '../src/review-evidence.js';
import { checkReviewEvidence } from '../src/review-evidence-check.js';
import { describeProviderSources } from '../src/provider-sources.js';
const head = 'a'.repeat(40), base = 'b'.repeat(40);
const config = { scm: { provider: 'github', owner: 'team', repository: 'site' }, ci: { provider: 'github-actions', owner: 'team', repository: 'site' } };

test('compares editable evidence with configured sources and current PR revisions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-evidence-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'evidence.md');
  await saveReviewEvidence({ outputPath: path }, { collect: async () => ({ provider: 'github', number: 7, sources: describeProviderSources(config), review: { head, base }, ci: { sha: head }, limitations: [] }) });
  let calls = 0;
  const scm = { provider: 'github', getPullRequest: async () => { calls++; return { number: 7, head: { sha: head }, base: { sha: base } }; } };
  const result = await checkReviewEvidence({ path, config, scm });
  assert.equal(result.consistent, true);
  assert.equal(result.ciFreshness, 'not-checked');
  assert.match(result.scope, /forged/);
  const changed = await checkReviewEvidence({ path, config, scm: { ...scm, getPullRequest: async () => ({ number: 7, head: { sha: 'c'.repeat(40) }, base: { sha: base } }) } });
  assert.equal(changed.revisionMatches, false);
  const mismatch = await checkReviewEvidence({ path, config: { ...config, ci: { ...config.ci, repository: 'other' } }, scm });
  assert.equal(mismatch.sourceMatches, false);
  assert.equal(calls, 1);
  await writeFile(path, '# invalid');
  await assert.rejects(checkReviewEvidence({ path, config, scm }), /format/);
});

test('does not claim Azure revision freshness', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-evidence-azure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'evidence.md');
  const cfg = { scm: { provider: 'ado', organization: 'org', project: 'site', repository: 'repo' }, ci: { provider: 'gitlab-ci', project: 'team/site' } };
  await saveReviewEvidence({ outputPath: path }, { collect: async () => ({ provider: 'ado', number: 7, sources: describeProviderSources(cfg), review: {}, ci: { sha: head }, limitations: [] }) });
  const result = await checkReviewEvidence({ path, config: cfg, scm: { provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }) } });
  assert.equal(result.revisionMatches, null);
  assert.equal(result.consistent, false);
});
