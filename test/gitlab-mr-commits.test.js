import test from 'node:test';
import assert from 'node:assert/strict';
import { createScmProvider } from '../src/providers.js';
import { readGitLabMergeRequestCommits } from '../src/gitlab-mr-commits.js';
const refs = { base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), start_sha: 'c'.repeat(40) };
const mr = { iid: 7, diff_refs: refs }, commit = { id: 'b'.repeat(40) };

test('reads one GitLab commit response and reports unverified completeness', async () => {
  const requests = [];
  const scm = createScmProvider({ provider: 'gitlab', project: 'team/site' }, { gitlabToken: 'secret', fetchImpl: async url => {
    requests.push(url); return { ok: true, json: async () => url.endsWith('/commits') ? [commit] : mr };
  } });
  const result = await readGitLabMergeRequestCommits({ scm, number: 7 });
  assert.equal(result.commits[0].id, commit.id);
  assert.equal(result.commitListComplete, null);
  assert.equal(requests.length, 3);
  assert.match(result.limitations[0], /completeness/);
});

test('rejects changing revisions, invalid, repeated and oversized responses', async () => {
  let reads = 0;
  const scm = { provider: 'gitlab', getPullRequest: async () => mr, getMergeRequestCommits: async () => [commit] };
  await assert.rejects(readGitLabMergeRequestCommits({ scm: { ...scm, getPullRequest: async () => ++reads === 1 ? mr : { ...mr, diff_refs: { ...refs, head_sha: 'd'.repeat(40) } } }, number: 7 }), /changed/);
  await assert.rejects(readGitLabMergeRequestCommits({ scm: { ...scm, getMergeRequestCommits: async () => [commit, commit] }, number: 7 }), /repeated/);
  await assert.rejects(readGitLabMergeRequestCommits({ scm: { ...scm, getMergeRequestCommits: async () => [commit, commit] }, number: 7, maxCommits: 1 }), /oversized/);
});
