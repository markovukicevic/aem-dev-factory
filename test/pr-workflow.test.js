import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadyPullRequest } from '../src/pr-workflow.js';

const evidence = () => ({
  steps: [{ status: 'done' }], provenance: { verified: true, confidence: 'low' },
  checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'develop' },
});

test('does not contact the provider when a prerequisite fails', async () => {
  let calls = 0;
  const readiness = evidence();
  readiness.steps[0].status = 'pending';
  const result = await createReadyPullRequest({ provider: { createPullRequest: () => { calls++; } }, readiness, title: 'Example' });
  assert.equal(result.created, false);
  assert.equal(calls, 0);
  assert.match(result.blockers[0], /not done/);
});

test('passes approved branches to a provider and retains readiness warnings', async () => {
  let received;
  const result = await createReadyPullRequest({ provider: { createPullRequest: async input => { received = input; return { number: 1 }; } }, readiness: evidence(), title: 'Example', body: 'Summary', draft: true });
  assert.deepEqual(received, { title: 'Example', body: 'Summary', draft: true, head: 'feature', base: 'develop' });
  assert.equal(result.created, true);
  assert.equal(result.pullRequest.number, 1);
  assert.equal(result.warnings.length, 1);
});

test('propagates provider errors without retrying an ambiguous write', async () => {
  let calls = 0;
  await assert.rejects(createReadyPullRequest({ provider: { createPullRequest: async () => { calls++; throw new Error('network'); } }, readiness: evidence(), title: 'Example' }));
  assert.equal(calls, 1);
});
