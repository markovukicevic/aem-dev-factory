import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPullRequestReadiness } from '../src/inspect-readiness.js';

test('uses live Git state with separately supplied plan and test evidence', async () => {
  const readGit = async cwd => { assert.equal(cwd, '/repo'); return { head: 'feature', workingTreeClean: false }; };
  const result = await inspectPullRequestReadiness({ cwd: '/repo', steps: [{ status: 'done' }], testsPassed: true, base: 'main' }, { readGit });
  assert.equal(result.ready, false);
  assert.equal(result.readiness.branch.head, 'feature');
  assert.match(result.blockers.join(' '), /not clean/);
});

test('does not turn an unavailable Git state into a passing result', async () => {
  await assert.rejects(inspectPullRequestReadiness({ cwd: '/repo' }, { readGit: async () => { throw new Error('git unavailable'); } }));
});
