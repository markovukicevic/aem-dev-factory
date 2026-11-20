import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePullRequestReadiness } from '../src/pr-readiness.js';

const readyInput = () => ({
  steps: [{ status: 'done' }, { status: 'done' }],
  provenance: { verified: true, confidence: 'high' },
  checks: { testsPassed: true, workingTreeClean: true },
  branch: { base: 'main', head: 'feature/example' },
});

test('accepts a completed and verified plan with passing checks and distinct branches', () => {
  assert.deepEqual(evaluatePullRequestReadiness(readyInput()), { ready: true, blockers: [], warnings: [] });
});

test('blocks incomplete plans, missing evidence, unverified changes, and identical branches', () => {
  const result = evaluatePullRequestReadiness({
    steps: [{ status: 'done' }, { status: 'blocked' }], provenance: { verified: false },
    checks: { testsPassed: false, workingTreeClean: false }, branch: { base: 'main', head: 'main' },
  });
  assert.equal(result.ready, false);
  assert.equal(result.blockers.length, 5);
  assert.equal(evaluatePullRequestReadiness().ready, false);
  assert.equal(evaluatePullRequestReadiness({ ...readyInput(), steps: [] }).ready, false);
});

test('allows legacy plans without provenance and warns on low confidence', () => {
  assert.equal(evaluatePullRequestReadiness({ ...readyInput(), provenance: null }).ready, true);
  const result = evaluatePullRequestReadiness({ ...readyInput(), provenance: { verified: true, confidence: 'low' } });
  assert.equal(result.ready, true);
  assert.equal(result.warnings.length, 1);
});
