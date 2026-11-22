import test from 'node:test';
import assert from 'node:assert/strict';
import { readGitHubPullRequestCommits } from '../src/github-pr-commits.js';
import { createScmProvider } from '../src/providers.js';
const sha = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = commits => ({ number: 7, head: { sha }, base: { sha: base }, commits });
const entries = (start, count) => Array.from({ length: count }, (_, i) => ({ sha: (start + i + 1).toString(16).padStart(40, '0') }));

test('fetches bounded GitHub PR commits through the provider and preserves limitations', async () => {
  const requests = [];
  const scm = createScmProvider({ provider: 'github', owner: 'team', repository: 'site' }, { token: 'secret', fetchImpl: async url => {
    requests.push(url); const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => url.includes('/commits?') ? entries((page - 1) * 100, page < 3 ? 100 : 50) : pr(300) };
  } });
  const result = await readGitHubPullRequestCommits({ scm, number: 7 });
  assert.equal(result.commitsReturned, 250);
  assert.equal(result.commitListComplete, false);
  assert.equal(requests.length, 5);
  assert.match(result.limitations[0], /250/);
});

test('reports complete lists and rejects changed PRs, duplicate and incomplete pages', async () => {
  let reads = 0;
  const scm = { provider: 'github', getPullRequest: async () => pr(2), listPullRequestCommits: async () => entries(0, 2) };
  assert.equal((await readGitHubPullRequestCommits({ scm, number: 7 })).commitListComplete, true);
  await assert.rejects(readGitHubPullRequestCommits({ scm: { ...scm, listPullRequestCommits: async () => entries(0, 1) }, number: 7 }), /Incomplete/);
  await assert.rejects(readGitHubPullRequestCommits({ scm: { ...scm, listPullRequestCommits: async () => [entries(0, 1)[0], entries(0, 1)[0]] }, number: 7 }), /repeated/);
  await assert.rejects(readGitHubPullRequestCommits({ scm: { ...scm, getPullRequest: async () => ++reads === 1 ? pr(2) : { ...pr(2), head: { sha: 'c'.repeat(40) } } }, number: 7 }), /changed while/);
});
