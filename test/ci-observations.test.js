import test from 'node:test';
import assert from 'node:assert/strict';
import { readCiObservations } from '../src/ci-observations.js';
const sha = 'a'.repeat(40);

test('summarizes observed statuses without inventing an overall verdict', async () => {
  const gitlab = { provider: 'gitlab-ci', listAllPipelines: async () => [{ sha, status: 'success' }, { sha, status: 'running' }] };
  const result = await readCiObservations({ ci: gitlab, sha });
  assert.deepEqual(result.states, [{ state: 'running', count: 1 }, { state: 'success', count: 1 }]);
  assert.equal(result.state, undefined);
  await assert.rejects(readCiObservations({ ci: { ...gitlab, listAllPipelines: async () => [{ sha: 'b'.repeat(40) }] }, sha }), /does not match/);
  const bitbucket = await readCiObservations({ ci: { provider: 'bitbucket-pipelines', getAllCommitStatuses: async () => [{ state: 'SUCCESSFUL' }, {}] }, sha });
  assert.equal(bitbucket.count, 2);
  assert.match(bitbucket.scope, /not independently verified/);
});

test('keeps Azure project-wide attribution and incomplete pagination explicit', async () => {
  const ci = { provider: 'ado-pipelines', listBuilds: async () => ({ values: [{ sourceVersion: sha, result: 'succeeded' }, { sourceVersion: 'bad' }], continuationToken: null }) };
  const result = await readCiObservations({ ci, sha, branch: 'feature' });
  assert.equal(result.unattributed, 1);
  assert.equal(result.states[0].state, 'succeeded');
  assert.match(result.scope, /repository identity/);
  await assert.rejects(readCiObservations({ ci, sha }), /branch/);
  await assert.rejects(readCiObservations({ ci: { provider: 'gitlab-ci' }, sha, branch: 'main' }), /only for Azure/);
});

test('preserves GitHub observed summary and rejects abbreviated SHAs', async () => {
  const ci = { provider: 'github-actions', listCheckRuns: async () => ({ total_count: 0, check_runs: [] }), getCommitStatus: async () => ({ total_count: 0 }) };
  assert.equal((await readCiObservations({ ci, sha })).summary.state, 'unknown');
  await assert.rejects(readCiObservations({ ci, sha: 'abcdef0' }), /full Git/);
});
