import test from 'node:test';
import assert from 'node:assert/strict';
import { readGitHubPullRequestFiles } from '../src/github-pr-files.js';
import { createScmProvider } from '../src/providers.js';
const sha = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = changed_files => ({ number: 7, head: { sha }, base: { sha: base }, changed_files });
const files = (offset, count) => Array.from({ length: count }, (_, i) => ({ filename: `file-${offset + i}`, status: 'modified', patch: '@@ test' }));

test('reads and verifies GitHub PR files across pages', async () => {
  const requests = [];
  const scm = createScmProvider({ provider: 'github', owner: 'team', repository: 'site' }, { token: 'secret', fetchImpl: async url => { requests.push(url); const page = Number(new URL(url).searchParams.get('page')); return { ok: true, json: async () => url.includes('/files?') ? files((page - 1) * 100, page === 1 ? 100 : 1) : pr(101) }; } });
  const result = await readGitHubPullRequestFiles({ scm, number: 7 });
  assert.equal(result.fileListComplete, true);
  assert.equal(result.files.length, 101);
  assert.equal(result.head, sha);
  assert.equal(requests.length, 4);
  assert.match(result.limitations[0], /truncated/);
});

test('detects moving PRs, missing pages and duplicated filenames', async () => {
  let reads = 0;
  const scm = { provider: 'github', getPullRequest: async () => ++reads === 1 ? pr(1) : { ...pr(1), head: { sha: 'c'.repeat(40) } }, listPullRequestFiles: async () => files(0, 1) };
  await assert.rejects(readGitHubPullRequestFiles({ scm, number: 7 }), /changed while/);
  await assert.rejects(readGitHubPullRequestFiles({ scm: { ...scm, getPullRequest: async () => pr(2), listPullRequestFiles: async () => files(0, 1) }, number: 7 }), /Incomplete/);
  await assert.rejects(readGitHubPullRequestFiles({ scm: { ...scm, getPullRequest: async () => pr(2), listPullRequestFiles: async () => [files(0, 1)[0], files(0, 1)[0]] }, number: 7 }), /repeated/);
});

test('reports a bounded file list as incomplete', async () => {
  const scm = { provider: 'github', getPullRequest: async () => pr(101), listPullRequestFiles: async () => files(0, 100) };
  const result = await readGitHubPullRequestFiles({ scm, number: 7, maxPages: 1 });
  assert.equal(result.filesReturned, 100);
  assert.equal(result.fileListComplete, false);
  await assert.rejects(readGitHubPullRequestFiles({ scm: { ...scm, provider: 'gitlab' }, number: 7 }), /Invalid/);
});
