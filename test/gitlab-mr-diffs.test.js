import test from 'node:test';
import assert from 'node:assert/strict';
import { createScmProvider } from '../src/providers.js';
import { readGitLabMergeRequestDiffs } from '../src/gitlab-mr-diffs.js';
const refs = { base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), start_sha: 'c'.repeat(40) };
const mr = { iid: 7, diff_refs: refs };

test('reads paginated GitLab diffs but does not assert full coverage', async () => {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    const page = new URL(url).searchParams.get('page');
    return { ok: true, headers: { get: () => page === '1' ? '2' : '' }, json: async () => url.includes('/diffs?') ? [{ old_path: `old-${page}`, new_path: `new-${page}`, diff: '@@ example', too_large: page === '2' }] : mr };
  };
  const scm = createScmProvider({ provider: 'gitlab', project: 'team/site' }, { gitlabToken: 'secret', fetchImpl });
  const result = await readGitLabMergeRequestDiffs({ scm, number: 7 });
  assert.equal(result.files.length, 2);
  assert.equal(result.files[1].too_large, true);
  assert.equal(result.paginationComplete, true);
  assert.equal(result.diffComplete, null);
  assert.equal(requests.length, 4);
});

test('detects changing revisions, invalid pages and bounded pagination', async () => {
  let reads = 0;
  const scm = { provider: 'gitlab', getPullRequest: async () => ++reads === 1 ? mr : { ...mr, diff_refs: { ...refs, head_sha: 'd'.repeat(40) } }, listMergeRequestDiffs: async () => ({ values: [], nextPage: null }) };
  await assert.rejects(readGitLabMergeRequestDiffs({ scm, number: 7 }), /changed/);
  const fixed = { ...scm, getPullRequest: async () => mr };
  await assert.rejects(readGitLabMergeRequestDiffs({ scm: { ...fixed, listMergeRequestDiffs: async () => ({ values: [], nextPage: '1' }) }, number: 7 }), /Invalid GitLab next page/);
  const limited = await readGitLabMergeRequestDiffs({ scm: { ...fixed, listMergeRequestDiffs: async () => ({ values: [], nextPage: '2' }) }, number: 7, maxPages: 1 });
  assert.equal(limited.paginationComplete, false);
  assert.equal(limited.diffComplete, null);
  await assert.rejects(readGitLabMergeRequestDiffs({ scm: { ...fixed, getPullRequest: async () => ({ iid: 7 }) }, number: 7 }), /revisions unavailable/);
});
