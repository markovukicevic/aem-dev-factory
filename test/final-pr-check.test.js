import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBeforePullRequestWrite } from '../src/final-pr-check.js';
const commit = 'a'.repeat(40), expectedPlan = 'b'.repeat(64), expectedConfig = 'c'.repeat(64);
function options() {
  return { cwd: '/repo', planPath: '/plan', configPath: '/config', head: 'feature', base: 'main', commit, expectedPlan, expectedConfig, refresh: async () => ({ ready: true, blockers: [], warnings: [], readiness: { branch: { head: 'feature', base: 'main', commit }, planDigest: expectedPlan } }), configDigest: async () => expectedConfig, publishedReader: async () => ({ published: true, commit }) };
}
test('accepts consistent evidence and rejects missing evidence', async () => {
  assert.equal((await checkBeforePullRequestWrite(options())).ready, true);
  await assert.rejects(checkBeforePullRequestWrite({ ...options(), expectedPlan: undefined }), /evidence/);
});
test('blocks configuration and publication changes before writing', async () => {
  const changedConfig = await checkBeforePullRequestWrite({ ...options(), configDigest: async () => 'd'.repeat(64) });
  assert.equal(changedConfig.ready, false);
  assert.match(changedConfig.blockers[0], /configuration/);
  const changedRemote = await checkBeforePullRequestWrite({ ...options(), publishedReader: async () => ({ published: true, commit: 'e'.repeat(40) }) });
  assert.equal(changedRemote.ready, false);
  assert.match(changedRemote.blockers[0], /Published branch/);
});
