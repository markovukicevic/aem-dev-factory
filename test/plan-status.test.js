import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlanStatus, readPlanStatus } from '../src/plan-status.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const step = (number, status) => `### Step ${number}: Change ${number}\n**Status:** ${status}\n`;
test('identifies the next pending step without claiming verification', () => {
  const result = summarizePlanStatus(step(1, 'done') + step(2, 'pending') + step(3, 'pending'));
  assert.equal(result.next.number, 2);
  assert.equal(result.counts.pending, 2);
  assert.equal(result.allStepsDone, false);
  assert.match(result.scope, /not checked/);
});
test('blocks selection while any work is blocked or in progress', () => {
  for (const status of ['blocked', 'in-progress']) {
    const result = summarizePlanStatus(step(1, status) + step(2, 'pending'));
    assert.equal(result.next, null);
    assert.equal(result.blockers[0].status, status);
  }
  assert.equal(summarizePlanStatus(step(1, 'done')).allStepsDone, true);
  assert.throws(() => summarizePlanStatus('not a plan'));
});
