import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGitHubCi, readGitHubCiSummary } from '../src/github-ci-summary.js';

const status = (total_count, state = 'success') => ({ total_count, state });
const checks = (...check_runs) => ({ total_count: check_runs.length, check_runs });
const run = (status, conclusion = null) => ({ status, conclusion });

test('summarizes observed results without claiming branch protection', () => {
  assert.equal(summarizeGitHubCi(checks(run('completed', 'success')), status(0)).state, 'success');
  assert.equal(summarizeGitHubCi(checks(), status(0, 'pending')).state, 'unknown');
  assert.equal(summarizeGitHubCi(checks(run('in_progress')), status(0)).state, 'pending');
  assert.equal(summarizeGitHubCi(checks(run('completed', 'failure')), status(1)).state, 'failure');
  assert.equal(summarizeGitHubCi(checks(run('completed', 'skipped')), status(0)).state, 'unknown');
  assert.equal(summarizeGitHubCi({ total_count: 101, check_runs: [run('completed', 'success')] }, status(0)).state, 'unknown');
  assert.throws(() => summarizeGitHubCi({ total_count: 0, check_runs: [{}] }, status(0)));
});

test('requests both GitHub result types', async () => {
  const result = await readGitHubCiSummary({ listCheckRuns: async (sha, options) => { assert.equal(sha, 'abc1234'); assert.deepEqual(options, { page: 1, perPage: 100 }); return checks(); }, getCommitStatus: async () => status(1) }, 'abc1234');
  assert.equal(result.state, 'success');
  assert.match(result.scope, /branch protection/);
});
